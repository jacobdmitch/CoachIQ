import { gameStates, playtimeTrackers } from '../liveGameStore.js';
import { getLineCoachRecommendation } from '../lineCoachEngine.js';
import { broadcastGameUpdate } from '../../routes/game-sync.js';
import { query } from '../database.js';
import logger from '../logger.js';

/**
 * Proactive Line Coach scheduler
 *
 * Owns the push side of the live-game AI surface. The pull-model endpoint
 * (POST /api/ai-coach/recommendations) still exists for manual coach-initiated
 * requests; this service handles the cadence-and-event-driven pushes the
 * coach never explicitly asks for.
 *
 * Lifecycle:
 *   - Game start:  register(gameId, { coachId, teamId, format })
 *   - Game end:    deregister(gameId)
 *   - Key events:  onEvent(gameId, 'substitution' | 'score' | 'quarter_change')
 *
 * Per game, the scheduler runs a setInterval tick and also accepts
 * synchronous event triggers. Each evaluation produces at most one push,
 * selected by urgency ranking, after passing a cooldown gate. Pushes are
 * persisted to proactive_push_log and emitted on the existing Socket.io
 * game namespace as `ai:recommendation`.
 *
 * Cost / rate shape (approximate, live game):
 *   - 60s timer + N events per quarter
 *   - Haiku terse intent (isLiveGame + no focusArea = terse budget)
 *   - Global + per-type cooldowns prevent per-tick spam even when the
 *     recommender keeps returning the same suggestion
 */

// ─── Config ────────────────────────────────────────────────────────────────
// Kept as a mutable default so tests or ops can tweak without code changes.
// If this grows, move to a DB-backed config table keyed by coach/team.
const DEFAULT_CONFIG = {
  tickIntervalMs: 60 * 1000,
  // A just-registered scheduler waits this long before its first evaluation,
  // so game-start and clock-start bursts don't cause an immediate push.
  warmupMs: 30 * 1000,
  // Push gates
  urgencyFloor: 'medium', // one of low | medium | high
  globalCooldownMs: 60 * 1000,
  typeCooldownMs: {
    SUBSTITUTION:       120 * 1000,
    PLAYTIME_ANALYSIS:  180 * 1000,
    LINEUP_EVALUATION:  180 * 1000,
    POSITION_FIT:       300 * 1000,
    ALERT:               60 * 1000,
  },
  // Per-athlete cooldown on SUBSTITUTION recs, so we don't churn a coach
  // with sub/un-sub pings for the same player.
  athleteCooldownMs: 180 * 1000,
};

const URGENCY_RANK = { low: 1, medium: 2, high: 3 };

// ─── State ─────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} SchedulerState
 * @property {Object} ctx                  - { coachId, teamId, format }
 * @property {NodeJS.Timeout|null} intervalId
 * @property {number} registeredAt
 * @property {boolean} evaluating          - re-entrancy guard
 * @property {Object} cooldowns
 * @property {number} cooldowns.lastPushAt
 * @property {Object<string, number>} cooldowns.byType
 * @property {Object<string, number>} cooldowns.byAthlete
 */

/** @type {Map<string, SchedulerState>} */
const schedulers = new Map();

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Start the scheduler for a game. Safe to call repeatedly; a second call
 * replaces the prior scheduler.
 */
export function register(gameId, ctx = {}) {
  if (!gameId) return;
  if (schedulers.has(gameId)) deregister(gameId);

  const state = {
    ctx: { coachId: ctx.coachId || null, teamId: ctx.teamId || null, format: ctx.format || 'standard' },
    intervalId: null,
    registeredAt: Date.now(),
    evaluating: false,
    cooldowns: { lastPushAt: 0, byType: {}, byAthlete: {} },
  };

  state.intervalId = setInterval(() => {
    _evaluate(gameId, { reason: 'timer' }).catch((err) =>
      logger.error('proactiveCoach timer eval failed', { gameId, error: err.message })
    );
  }, DEFAULT_CONFIG.tickIntervalMs);

  schedulers.set(gameId, state);
  logger.info('proactiveCoach registered', { gameId, coachId: state.ctx.coachId });
}

/**
 * Stop the scheduler for a game and drop its state. No-op if not registered.
 */
export function deregister(gameId) {
  const state = schedulers.get(gameId);
  if (!state) return;
  if (state.intervalId) clearInterval(state.intervalId);
  schedulers.delete(gameId);
  logger.info('proactiveCoach deregistered', { gameId });
}

/**
 * Fire an immediate evaluation in response to a game event. Reasons are
 * free-form strings captured in proactive_push_log.trigger_reason for
 * later analysis.
 */
export async function onEvent(gameId, reason) {
  if (!schedulers.has(gameId)) return;
  try {
    await _evaluate(gameId, { reason: reason || 'event' });
  } catch (err) {
    logger.error('proactiveCoach event eval failed', { gameId, reason, error: err.message });
  }
}

/**
 * Mark a push as acknowledged. Called by the ack HTTP route.
 * Returns the updated row or null.
 */
export async function acknowledge(pushId) {
  if (!pushId) return null;
  try {
    const result = await query(
      `UPDATE proactive_push_log
          SET acknowledged_at = NOW()
        WHERE id = $1 AND acknowledged_at IS NULL AND dismissed_at IS NULL
        RETURNING id, game_id, rec_type, acknowledged_at`,
      [pushId]
    );
    return result.rows[0] || null;
  } catch (err) {
    logger.error('proactiveCoach acknowledge failed', { pushId, error: err.message });
    return null;
  }
}

/**
 * Mark a push as dismissed. Called by the dismiss HTTP route.
 * Dismissed recs extend the per-type cooldown so the same rec doesn't
 * bounce right back on the next tick.
 */
export async function dismiss(pushId) {
  if (!pushId) return null;
  try {
    const result = await query(
      `UPDATE proactive_push_log
          SET dismissed_at = NOW()
        WHERE id = $1 AND acknowledged_at IS NULL AND dismissed_at IS NULL
        RETURNING id, game_id, rec_type, dismissed_at`,
      [pushId]
    );
    const row = result.rows[0];
    if (row) {
      const state = schedulers.get(row.game_id);
      if (state) {
        // Extend the cooldown for the dismissed type by 2x. Keeps it simple
        // and observable; refine after beta data.
        const extra = (DEFAULT_CONFIG.typeCooldownMs[row.rec_type] || 0);
        state.cooldowns.byType[row.rec_type] = Date.now() + extra;
      }
    }
    return row || null;
  } catch (err) {
    logger.error('proactiveCoach dismiss failed', { pushId, error: err.message });
    return null;
  }
}

// ─── Internals ─────────────────────────────────────────────────────────────

/**
 * Run one evaluation cycle for a game. Guards against re-entrancy so a slow
 * Claude call can't overlap with the next timer tick.
 * @private
 */
async function _evaluate(gameId, { reason }) {
  const state = schedulers.get(gameId);
  if (!state) return;
  if (state.evaluating) return;

  // Warmup: ignore timer ticks until warmupMs has passed. Events still fire.
  if (
    reason === 'timer' &&
    Date.now() - state.registeredAt < DEFAULT_CONFIG.warmupMs
  ) {
    return;
  }

  const gameState = gameStates.get(gameId);
  const playtimeTracker = playtimeTrackers.get(gameId);
  if (!gameState) return;

  // Timer ticks only matter while the clock is running. Events run regardless
  // (e.g. quarter-change happens with the clock stopped by definition).
  if (reason === 'timer' && !gameState.clockRunning) return;

  state.evaluating = true;
  try {
    const playtimeData = playtimeTracker
      ? {
          summary: playtimeTracker.getPlaytimeSummary(),
          flags:   playtimeTracker.getEquityFlags(),
        }
      : { summary: [], flags: [] };

    const rec = await getLineCoachRecommendation(gameState, playtimeData, {
      format:          state.ctx.format,
      coachId:         state.ctx.coachId,
      teamId:          state.ctx.teamId,
      playtimeTracker,
      isLiveGame:      true,
    });

    if (rec.error || !rec.suggestions?.length) return;

    const winner = _pickWinner(state, rec.suggestions);
    if (!winner) return;

    _recordCooldown(state, winner);
    await _persistAndEmit(gameId, state, winner, reason);
  } finally {
    state.evaluating = false;
  }
}

/**
 * Apply urgency floor, urgency sort, and cooldown filter. Returns the
 * single best suggestion that can be pushed right now, or null.
 * @private
 */
function _pickWinner(state, suggestions) {
  const floor = URGENCY_RANK[DEFAULT_CONFIG.urgencyFloor] || 2;
  const eligible = suggestions.filter((s) => {
    const rank = URGENCY_RANK[s.urgency || 'medium'] || 2;
    return rank >= floor;
  });
  if (eligible.length === 0) return null;

  eligible.sort((a, b) =>
    (URGENCY_RANK[b.urgency || 'medium'] || 0) -
    (URGENCY_RANK[a.urgency || 'medium'] || 0)
  );

  return eligible.find((s) => _passesCooldown(state, s)) || null;
}

/**
 * @private
 */
function _passesCooldown(state, suggestion) {
  const now = Date.now();
  if (now - state.cooldowns.lastPushAt < DEFAULT_CONFIG.globalCooldownMs) return false;

  const typeCd = DEFAULT_CONFIG.typeCooldownMs[suggestion.type] || 0;
  if (typeCd && now - (state.cooldowns.byType[suggestion.type] || 0) < typeCd) return false;

  if (suggestion.type === 'SUBSTITUTION' && suggestion.playerIn) {
    const last = state.cooldowns.byAthlete[suggestion.playerIn] || 0;
    if (now - last < DEFAULT_CONFIG.athleteCooldownMs) return false;
  }

  return true;
}

/**
 * @private
 */
function _recordCooldown(state, suggestion) {
  const now = Date.now();
  state.cooldowns.lastPushAt = now;
  state.cooldowns.byType[suggestion.type] = now;
  if (suggestion.type === 'SUBSTITUTION' && suggestion.playerIn) {
    state.cooldowns.byAthlete[suggestion.playerIn] = now;
  }
}

/**
 * Insert the push row and emit it on the game's socket channel. A failed
 * insert is logged and the emit is skipped - the coach shouldn't see a
 * push we can't later reconcile with the log.
 * @private
 */
async function _persistAndEmit(gameId, state, suggestion, reason) {
  let row;
  try {
    const result = await query(
      `INSERT INTO proactive_push_log
         (game_id, coach_id, rec_type, urgency, trigger_reason, payload)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, pushed_at`,
      [
        gameId,
        state.ctx.coachId,
        suggestion.type,
        suggestion.urgency || 'medium',
        reason || null,
        JSON.stringify(suggestion),
      ]
    );
    row = result.rows[0];
  } catch (err) {
    logger.error('proactiveCoach persist failed; dropping push', {
      gameId,
      recType: suggestion.type,
      error: err.message,
    });
    return;
  }

  broadcastGameUpdate(gameId, 'ai:recommendation', {
    pushId:    row.id,
    pushedAt:  row.pushed_at,
    reason:    reason || null,
    suggestion,
  });
  logger.info('proactiveCoach pushed', { gameId, pushId: row.id, type: suggestion.type, reason });
}

// ─── Test hooks (not exported from index) ──────────────────────────────────
// Internal helpers exposed on the default export so tests can reach them
// without exporting names that imply public contract.
export const _internal = {
  _pickWinner,
  _passesCooldown,
  _recordCooldown,
  DEFAULT_CONFIG,
  URGENCY_RANK,
  schedulers,
};

export default {
  register,
  deregister,
  onEvent,
  acknowledge,
  dismiss,
};
