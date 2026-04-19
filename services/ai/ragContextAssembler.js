import { getClient } from '../database.js';
import logger from '../logger.js';

/**
 * RAG pre-call context assembler
 *
 * Before a Line Coach tool call that needs more than in-memory state, this
 * assembler pulls the small set of rows relevant to the decision being made,
 * keyed by "risk tier" (e.g. LINEUP_WRITE). Results are cached briefly so
 * back-to-back calls within the same burst don't re-query the database.
 *
 * Design notes:
 *   - Reads run inside a transaction with a SAVEPOINT so a partial failure
 *     can be rolled back without poisoning any enclosing state the caller
 *     might have. The assembler is read-only, but isolating under a savepoint
 *     matches the pattern used by the write-path tiers and keeps the shape
 *     consistent.
 *   - Cache TTL defaults to 90 seconds. That's long enough to absorb a burst
 *     of proactive recommendations for the same game, short enough that a
 *     stale lineup read never blocks a real substitution decision.
 *
 * Supported tiers (initial):
 *   - LINEUP_WRITE: roster with positions, recent sub events for the game.
 *
 * Additional tiers (SCORING_WRITE, PLAYTIME_WRITE) can be added here when
 * the corresponding features are wired in.
 */

const DEFAULT_TTL_MS = 90 * 1000;

const TIERS = {
  LINEUP_WRITE:   'LINEUP_WRITE',
  SCORING_WRITE:  'SCORING_WRITE',
  PLAYTIME_WRITE: 'PLAYTIME_WRITE',
};

// Module-scoped cache: key -> { expiresAt, value }
const _cache = new Map();

/**
 * @param {string} tier
 * @param {Object} scope - fields that uniquely identify a cacheable context
 */
function _cacheKey(tier, scope = {}) {
  return `${tier}:${scope.gameId || ''}:${scope.teamId || ''}`;
}

function _readCache(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    _cache.delete(key);
    return null;
  }
  return entry.value;
}

function _writeCache(key, value, ttlMs) {
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Drop all cached contexts. Callers should invalidate after any write that
 * changes roster/lineup/score state, or leave it to the TTL for best-effort
 * freshness.
 */
export function invalidate() {
  _cache.clear();
}

/**
 * Assemble context for a given risk tier. Returns an object shaped to be
 * pasted into Claude's context; never throws - on failure returns an empty
 * context plus an error field so the caller can decide to continue or abort.
 *
 * @param {string} tier - One of TIERS.*
 * @param {Object} scope
 * @param {string} [scope.gameId]
 * @param {string} [scope.teamId]
 * @param {Object} [options]
 * @param {number} [options.ttlMs=90000]
 * @param {boolean} [options.bypassCache=false]
 * @returns {Promise<Object>}
 */
export async function assemble(tier, scope = {}, options = {}) {
  const { ttlMs = DEFAULT_TTL_MS, bypassCache = false } = options;

  if (!TIERS[tier]) {
    return { tier, error: `Unknown tier: ${tier}`, data: null };
  }

  const key = _cacheKey(tier, scope);
  if (!bypassCache) {
    const cached = _readCache(key);
    if (cached) return { ...cached, cacheHit: true };
  }

  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');
    await client.query('SAVEPOINT rag_read');

    let data;
    try {
      switch (tier) {
        case TIERS.LINEUP_WRITE:
          data = await _assembleLineupWrite(client, scope);
          break;
        default:
          // Scaffolded but not yet implemented. Kept explicit so callers
          // that try a future tier get a clear signal rather than a silent
          // empty context.
          data = { tier, note: 'tier not yet implemented' };
      }
      await client.query('RELEASE SAVEPOINT rag_read');
    } catch (readErr) {
      await client.query('ROLLBACK TO SAVEPOINT rag_read').catch(() => {});
      throw readErr;
    }

    await client.query('COMMIT');

    const result = { tier, scope, data, assembledAt: Date.now(), cacheHit: false };
    _writeCache(key, result, ttlMs);
    return result;
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }
    logger.error('RAG assemble failed', { tier, scope, error: err.message });
    return { tier, scope, error: err.message, data: null };
  } finally {
    if (client) client.release();
  }
}

/**
 * LINEUP_WRITE tier:
 *   - Full active-roster listing (so Claude can see who is eligible to
 *     enter the field slots), including primary position for matchup fit.
 *   - Recent sub_in / sub_out events for the game, ordered newest first,
 *     so Claude doesn't recommend re-subbing someone who just went off or
 *     on. Limit kept small (20) to keep the context token cost predictable.
 *
 * @private
 */
async function _assembleLineupWrite(client, { gameId, teamId }) {
  if (!teamId) {
    throw new Error('LINEUP_WRITE requires scope.teamId');
  }

  const roster = await client.query(
    `SELECT id, first_name, last_name, jersey_number, primary_position, graduation_year
       FROM athletes
      WHERE team_id = $1
      ORDER BY jersey_number NULLS LAST`,
    [teamId]
  );

  let recentSubs = { rows: [] };
  if (gameId) {
    recentSubs = await client.query(
      `SELECT id, athlete_id, event_type, created_at
         FROM game_events
        WHERE game_id = $1
          AND event_type IN ('sub_in', 'sub_out')
        ORDER BY created_at DESC
        LIMIT 20`,
      [gameId]
    );
  }

  return {
    roster: roster.rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`,
      jerseyNumber: r.jersey_number,
      primaryPosition: r.primary_position,
      graduationYear: r.graduation_year,
    })),
    recentSubs: recentSubs.rows.map((r) => ({
      id: r.id,
      athleteId: r.athlete_id,
      type: r.event_type,
      at: r.created_at,
    })),
  };
}

export const RISK_TIERS = TIERS;

export default {
  assemble,
  invalidate,
  RISK_TIERS,
};
