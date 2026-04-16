import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import logger from '../services/logger.js';
import { query } from '../services/database.js';
import GameStateManager from '../services/gameStateManager.js';
import PlaytimeTracker from '../services/playtimeTracker.js';
import { z } from 'zod';
import { persistGameEvent, persistPlaytimeEntry, saveGameStateSnapshot, loadGameStateSnapshot } from '../services/gamePersistence.js';
import { broadcastGameUpdate } from './game-sync.js';
import { gameStates, playtimeTrackers, clockIntervals } from '../services/liveGameStore.js';
import { resolveSituation } from '../services/situationResolver.js';

const subSchema = z.object({
  playerIn: z.string().uuid(),
  playerOut: z.string().uuid(),
  position: z.string().max(20).optional(),
});

const eventSchema = z.object({
  eventType: z.string().min(1).max(30),
  athleteId: z.string().uuid(),
  metadata: z.record(z.any()).optional(),
});

const OPPONENT_EVENT_TYPES = [
  'goal', 'assist', 'shot', 'shot_on_goal',
  'ground_ball', 'turnover', 'caused_turnover',
  'save', 'penalty', 'faceoff_win', 'faceoff_loss',
];

const opponentEventSchema = z.object({
  eventType: z.enum(OPPONENT_EVENT_TYPES),
  opposingPlayerId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.any()).optional(),
});

const scoreSchema = z.object({
  team: z.enum(['home', 'away']),
  points: z.number().int().min(0),
});

const router = express.Router();

// ─── Clock tick helpers ──────────────────────────────────────────────────────

/**
 * Start the server-side clock interval for a game.
 * Emits a `clock_tick` event every second to all connected clients so their
 * displays stay in sync regardless of when they joined.
 */
// How often (in seconds) to broadcast the playtime summary while the clock is
// running. Fast enough to feel live on the sideline, cheap enough to stay off
// the hot path.
const PLAYTIME_BROADCAST_INTERVAL_SECONDS = 5;

function startClockInterval(gameId) {
  if (clockIntervals.has(gameId)) return; // already running
  let ticks = 0;
  const interval = setInterval(() => {
    const gs = gameStates.get(gameId);
    if (!gs || !gs.clockRunning) {
      stopClockInterval(gameId);
      return;
    }
    const elapsed = Math.floor((Date.now() - gs.startTime) / 1000);
    gs.clockTime = elapsed;
    broadcastGameUpdate(gameId, 'clock_tick', { clockTime: elapsed });

    ticks += 1;
    if (ticks % PLAYTIME_BROADCAST_INTERVAL_SECONDS === 0) {
      const tracker = playtimeTrackers.get(gameId);
      if (tracker) {
        tracker.tick(Date.now());
        broadcastGameUpdate(gameId, 'playtime_tick', {
          summary:      tracker.getPlaytimeSummary(),
          equityFlags:  tracker.getEquityFlags(),
        });
      }
    }
  }, 1000);
  clockIntervals.set(gameId, interval);
}

/**
 * Clear the clock interval for a game (called on stop, end, or server restart).
 */
function stopClockInterval(gameId) {
  const interval = clockIntervals.get(gameId);
  if (interval) {
    clearInterval(interval);
    clockIntervals.delete(gameId);
  }
}

/**
 * POST /:gameId/start
 * Start a game and initialize GameStateManager.
 * Accepts optional startingLineup: { goalie, field_0, field_1, ... }
 * to pre-populate the field instead of starting with all players on bench.
 */
router.post(
  '/:gameId/start',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const { startingLineup } = req.body; // optional map of position → athleteId

    const gameResult = await query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (gameResult.rows.length === 0) throw new AppError('Game not found', 404);
    const game = gameResult.rows[0];

    const rosterResult = await query(
      'SELECT * FROM athletes WHERE team_id = $1 AND status = $2',
      [game.team_id, 'active']
    );
    const athletes = rosterResult.rows;

    const gameState = new GameStateManager(game, athletes);
    gameState.period = 1;
    gameState.state  = 'ACTIVE';

    const playtimeTracker = new PlaytimeTracker(athletes, 15);
    const now = Date.now();

    // Apply starting lineup if provided
    if (startingLineup && typeof startingLineup === 'object') {
      for (const [position, athleteId] of Object.entries(startingLineup)) {
        if (!athleteId) continue;
        if (!gameState.fieldPositions.hasOwnProperty(position)) continue;
        const benchIdx = gameState.bench.indexOf(athleteId);
        if (benchIdx === -1) continue; // not on bench (unknown athlete)

        gameState.fieldPositions[position] = athleteId;
        gameState.bench.splice(benchIdx, 1);
        playtimeTracker.subIn(athleteId, now);
      }

      // Persist lineup to games table
      await query(
        'UPDATE games SET starting_lineup = $1 WHERE id = $2',
        [JSON.stringify(startingLineup), gameId]
      );
    }

    // Mark game as active
    await query("UPDATE games SET status = 'active' WHERE id = $1", [gameId]);

    gameStates.set(gameId, gameState);
    playtimeTrackers.set(gameId, playtimeTracker);

    await saveGameStateSnapshot(gameId, req.coachId, gameState);
    broadcastGameUpdate(gameId, 'state_update', { state: gameState.getState() });

    logger.info(`Game started: ${gameId}`, { format: game.format, hasStartingLineup: !!startingLineup });

    res.json({ success: true, gameId, state: gameState.getState() });
  })
);

/**
 * POST /:gameId/clock/start
 * Start the game clock
 */
router.post(
  '/:gameId/clock/start',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const gameState = gameStates.get(gameId);

    if (!gameState) {
      throw new AppError('Game not initialized', 400);
    }

    const event = gameState.startClock();
    if (!event) {
      throw new AppError('Clock is already running', 400);
    }

    startClockInterval(gameId);
    broadcastGameUpdate(gameId, 'state_update', { event, state: gameState.getState() });
    logger.info(`Clock started: ${gameId}`);

    res.json({
      success: true,
      event,
      state: gameState.getState(),
    });
  })
);

/**
 * POST /:gameId/clock/stop
 * Stop the game clock
 */
router.post(
  '/:gameId/clock/stop',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const gameState = gameStates.get(gameId);

    if (!gameState) {
      throw new AppError('Game not initialized', 400);
    }

    const event = gameState.stopClock();
    if (!event) {
      throw new AppError('Clock is not running', 400);
    }

    stopClockInterval(gameId);
    broadcastGameUpdate(gameId, 'state_update', { event, state: gameState.getState() });
    logger.info(`Clock stopped: ${gameId}`);

    res.json({
      success: true,
      event,
      state: gameState.getState(),
    });
  })
);

/**
 * POST /:gameId/period/end
 * End current period
 */
router.post(
  '/:gameId/period/end',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const gameState = gameStates.get(gameId);

    if (!gameState) {
      throw new AppError('Game not initialized', 400);
    }

    const event = gameState.endPeriod();
    stopClockInterval(gameId); // clock is frozen between periods
    const playtimeTracker = playtimeTrackers.get(gameId);
    if (playtimeTracker) {
      playtimeTracker.endPeriod();
    }

    logger.info(`Period ended: ${gameId}, Period ${gameState.period}`);

    res.json({
      success: true,
      event,
      state: gameState.getState(),
    });
  })
);

/**
 * POST /:gameId/period/next
 * Start the next period
 */
router.post(
  '/:gameId/period/next',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const gameState = gameStates.get(gameId);

    if (!gameState) {
      throw new AppError('Game not initialized', 400);
    }

    const event = gameState.startNextPeriod();
    if (!event) {
      throw new AppError('Cannot start next period - not in break state', 400);
    }

    logger.info(`Period started: ${gameId}, Period ${gameState.period}`);

    res.json({
      success: true,
      event,
      state: gameState.getState(),
    });
  })
);

/**
 * POST /:gameId/sub
 * Execute a substitution
 * Body: { playerIn, playerOut, position }
 */
router.post(
  '/:gameId/sub',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const parsed = subSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
    }
    const { playerIn, playerOut, position } = parsed.data;

    const gameState = gameStates.get(gameId);
    if (!gameState) {
      throw new AppError('Game not initialized', 400);
    }

    // Record sub-out time
    const playtimeTracker = playtimeTrackers.get(gameId);
    if (playtimeTracker) {
      playtimeTracker.subOut(playerOut, Date.now());
      playtimeTracker.subIn(playerIn, Date.now());
    }

    // Execute substitution
    const event = gameState.executeSubstitution(playerIn, playerOut, position || 'field_0');

    if (event.error) {
      throw new AppError(event.error, 400);
    }

    // Persist sub events and playtime to database
    persistGameEvent(gameId, { ...event, type: 'PLAYER_SUBBED_IN', athleteId: playerIn });
    persistGameEvent(gameId, { ...event, type: 'PLAYER_SUBBED_OUT', athleteId: playerOut });
    saveGameStateSnapshot(gameId, req.coachId, gameState);

    broadcastGameUpdate(gameId, 'substitution', { event, state: gameState.getState() });
    logger.info(`Substitution: ${gameId}, In: ${playerIn}, Out: ${playerOut}`);

    res.json({
      success: true,
      event,
      state: gameState.getState(),
    });
  })
);

/**
 * POST /:gameId/event
 * Log a game event (goal, assist, etc.)
 * Body: { eventType, athleteId, metadata }
 */
router.post(
  '/:gameId/event',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
    }
    const { eventType, athleteId, metadata = {} } = parsed.data;

    const gameState = gameStates.get(gameId);
    if (!gameState) {
      throw new AppError('Game not initialized', 400);
    }

    const event = gameState.logEvent(eventType, athleteId, metadata);

    // Persist to database
    persistGameEvent(gameId, event);

    logger.debug(`Event logged: ${gameId}, ${eventType}, Player ${athleteId}`);

    res.json({
      success: true,
      event,
      state: gameState.getState(),
    });
  })
);

/**
 * POST /:gameId/opponent-event
 * Log a stat event for the opposing team during live play.
 * Body: { eventType, opposingPlayerId?, metadata? }
 *
 * opposingPlayerId is optional — when absent, the event is recorded as a
 * team-level opposing stat (still shows up in home/away totals, but is not
 * attributable to a specific player). When present, the event feeds the
 * per-player scouting history used by the threat calculator (P6).
 *
 * Opponent events do not affect our own playtime tracker or lineup state.
 */
router.post(
  '/:gameId/opponent-event',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const parsed = opponentEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
    }
    const { eventType, opposingPlayerId, metadata = {} } = parsed.data;

    const gameState = gameStates.get(gameId);
    if (!gameState) {
      throw new AppError('Game not initialized', 400);
    }

    // If an opposingPlayerId was provided, confirm it belongs to this game's
    // scouted opposing team. Anonymous team-side events bypass this check.
    if (opposingPlayerId) {
      const verify = await query(
        `SELECT op.id
           FROM opposing_players op
           JOIN opposing_teams ot ON op.opposing_team_id = ot.id
           JOIN games g           ON g.opposing_team_id = ot.id
          WHERE op.id = $1 AND g.id = $2`,
        [opposingPlayerId, gameId]
      );
      if (verify.rows.length === 0) {
        throw new AppError('opposingPlayerId does not belong to this game\'s opposing team', 400);
      }
    }

    // Record in the in-memory event log so live sync shows it, but do not
    // route through logEvent (which expects an athlete). Build the event
    // payload directly so persistGameEvent and consumers see teamSide.
    const DB_TO_INMEM = {
      goal: 'GOAL', assist: 'ASSIST', shot: 'SHOT', shot_on_goal: 'SHOT_ON_GOAL',
      ground_ball: 'GROUND_BALL', turnover: 'TURNOVER', caused_turnover: 'CAUSED_TURNOVER',
      save: 'SAVE', penalty: 'PENALTY',
      faceoff_win: 'FACEOFF_WIN', faceoff_loss: 'FACEOFF_LOSS',
    };
    const inMemType = DB_TO_INMEM[eventType];

    const event = {
      type:              inMemType,
      timestamp:         Date.now(),
      athleteId:         null,
      teamSide:          'away',
      opposingPlayerId:  opposingPlayerId || null,
      period:            gameState.period,
      clockTime:         gameState.clockTime,
      ...metadata,
    };
    gameState.events.push(event);

    // Persist to DB — persistGameEvent maps teamSide→team_side and nulls athlete
    persistGameEvent(gameId, event);

    broadcastGameUpdate(gameId, 'game_event', event);
    logger.debug(`Opponent event: ${gameId}, ${eventType}, opposingPlayer ${opposingPlayerId || 'team'}`);

    res.json({ success: true, event, state: gameState.getState() });
  })
);

/**
 * DELETE /:gameId/event/last
 * Undo the most recent stat event (goal, assist, shot, etc.) for this game.
 * Removes it from in-memory state and deletes it from the database.
 */
router.delete(
  '/:gameId/event/last',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;

    const gameState = gameStates.get(gameId);
    if (!gameState) throw new AppError('Game not initialized', 400);

    const removed = gameState.undoLastStatEvent();
    if (!removed) {
      return res.json({ success: true, removed: null, message: 'Nothing to undo.' });
    }

    // Map the in-memory event type to the DB event_type string
    const TYPE_MAP = {
      GOAL: 'goal', ASSIST: 'assist', SHOT: 'shot', SHOT_ON_GOAL: 'shot_on_goal',
      GROUND_BALL: 'ground_ball', TURNOVER: 'turnover', CAUSED_TURNOVER: 'caused_turnover',
      SAVE: 'save', PENALTY: 'penalty', FACEOFF_WIN: 'faceoff_win', FACEOFF_LOSS: 'faceoff_loss',
    };
    const dbType = TYPE_MAP[removed.type];

    if (dbType) {
      const teamSide = removed.teamSide === 'away' ? 'away' : 'home';
      if (teamSide === 'home' && removed.athleteId) {
        await query(
          `DELETE FROM game_events WHERE id = (
             SELECT id FROM game_events
             WHERE game_id = $1 AND team_side = 'home'
               AND athlete_id = $2 AND event_type = $3
             ORDER BY created_at DESC
             LIMIT 1
           )`,
          [gameId, removed.athleteId, dbType]
        );
      } else if (teamSide === 'away') {
        // Match on opposing_player_id when present; else match any team-side
        // opponent event of this type for the game.
        if (removed.opposingPlayerId) {
          await query(
            `DELETE FROM game_events WHERE id = (
               SELECT id FROM game_events
               WHERE game_id = $1 AND team_side = 'away'
                 AND opposing_player_id = $2 AND event_type = $3
               ORDER BY created_at DESC
               LIMIT 1
             )`,
            [gameId, removed.opposingPlayerId, dbType]
          );
        } else {
          await query(
            `DELETE FROM game_events WHERE id = (
               SELECT id FROM game_events
               WHERE game_id = $1 AND team_side = 'away'
                 AND opposing_player_id IS NULL AND event_type = $3
               ORDER BY created_at DESC
               LIMIT 1
             )`,
            [gameId, null, dbType]
          );
        }
      }
    }

    logger.info(`Undo last event: ${removed.type} (${removed.teamSide || 'home'}) in game ${gameId}`);
    broadcastGameUpdate(gameId, 'state_update', { state: gameState.getState() });

    res.json({ success: true, removed, state: gameState.getState() });
  })
);

/**
 * POST /:gameId/score
 * Update team score
 * Body: { team, points }
 */
router.post(
  '/:gameId/score',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const parsed = scoreSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
    }
    const { team, points } = parsed.data;

    const gameState = gameStates.get(gameId);
    if (!gameState) {
      throw new AppError('Game not initialized', 400);
    }

    const event = gameState.updateScore(team, points);
    if (event.error) {
      throw new AppError(event.error, 400);
    }

    // Persist score to games table immediately
    await query(
      `UPDATE games SET score_home = $1, score_away = $2 WHERE id = $3`,
      [gameState.homeScore, gameState.awayScore, gameId]
    );

    broadcastGameUpdate(gameId, 'score_update', { event, state: gameState.getState() });
    logger.info(`Score updated: ${gameId}, ${team} = ${points}`);

    res.json({
      success: true,
      event,
      state: gameState.getState(),
    });
  })
);

/**
 * GET /:gameId/state
 * Get current game state
 */
router.get(
  '/:gameId/state',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const gameState = gameStates.get(gameId);

    if (!gameState) {
      throw new AppError('Game not initialized', 404);
    }

    res.json({
      success: true,
      state: gameState.getState(),
    });
  })
);

/**
 * GET /:gameId/playtime
 * Get playtime summary for all players
 */
router.get(
  '/:gameId/playtime',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const playtimeTracker = playtimeTrackers.get(gameId);

    if (!playtimeTracker) {
      throw new AppError('Playtime tracking not initialized', 404);
    }

    const summary = playtimeTracker.getPlaytimeSummary();
    const flags = playtimeTracker.getEquityFlags();

    res.json({
      success: true,
      summary,
      equityFlags: flags,
    });
  })
);

/**
 * POST /:gameId/end
 * End the game and save final state
 */
router.post(
  '/:gameId/end',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const gameState = gameStates.get(gameId);

    if (!gameState) {
      throw new AppError('Game not initialized', 400);
    }

    gameState.state = 'COMPLETED';

    // Persist final state to database
    await query(
      `UPDATE games SET
        score_home = $1,
        score_away = $2,
        status = 'completed'
      WHERE id = $3`,
      [gameState.homeScore, gameState.awayScore, gameId]
    );

    // Mark game session as ended
    await query(
      `UPDATE game_sessions SET status = 'ended', game_state = $1, updated_at = NOW()
       WHERE game_id = $2 AND status = 'active'`,
      [JSON.stringify(gameState.getState()), gameId]
    );

    // Clean up memory and clock interval
    stopClockInterval(gameId);
    gameStates.delete(gameId);
    playtimeTrackers.delete(gameId);

    logger.info(`Game ended: ${gameId}`);

    res.json({
      success: true,
      finalState: gameState.getState(),
    });
  })
);

// ─── Sub Queue ────────────────────────────────────────────────────────────────

/**
 * POST /:gameId/sub-queue/add
 * Add an entry to the staging queue.
 * Handles three types:
 *   individual — { type, playerIn, playerOut, position }
 *   line       — { type, lineId }    (server resolves line → moves)
 *   situation  — { type, situationType }  (server resolves via situationResolver)
 */
router.post(
  '/:gameId/sub-queue/add',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const { type } = req.body;

    const gameState = gameStates.get(gameId);
    if (!gameState) throw new AppError('Game not initialized', 400);

    const playtimeTracker = playtimeTrackers.get(gameId);
    let entry;

    if (type === 'individual') {
      const { playerIn, playerOut, position } = req.body;
      if (!playerIn || !playerOut || !position) {
        throw new AppError('individual type requires playerIn, playerOut, position', 400);
      }
      const athlete = gameState.athletes.find(a => a.id === playerIn);
      entry = {
        queueId:        crypto.randomUUID(),
        type:           'individual',
        label:          athlete ? `${athlete.first_name} ${athlete.last_name}` : 'Sub',
        source:         'manual',
        situationType:  null,
        stayingPlayers: [],
        moves: [{
          moveId:    crypto.randomUUID(),
          playerIn,
          playerOut,
          position,
        }],
      };

    } else if (type === 'line') {
      const { lineId } = req.body;
      if (!lineId) throw new AppError('line type requires lineId', 400);

      const lineResult = await query('SELECT * FROM lines WHERE id = $1', [lineId]);
      if (lineResult.rows.length === 0) throw new AppError('Line not found', 404);

      entry = gameState.resolveLineSwap(lineResult.rows[0]);

    } else if (type === 'situation') {
      const { situationType } = req.body;
      if (!situationType) throw new AppError('situation type requires situationType', 400);

      // Load per-game assignment for this situation
      const assignmentResult = await query(
        'SELECT player_ids FROM game_situation_assignments WHERE game_id = $1 AND situation_type = $2',
        [gameId, situationType]
      );
      const assignedIds = assignmentResult.rows[0]?.player_ids || null;

      // Fetch full athlete list for scoring (situationResolver needs skill fields)
      const gameRecord = await query('SELECT team_id FROM games WHERE id = $1', [gameId]);
      const athletesResult = await query(
        'SELECT * FROM athletes WHERE team_id = $1 AND status = $2',
        [gameRecord.rows[0].team_id, 'active']
      );

      entry = resolveSituation(
        gameState,
        situationType,
        assignedIds,
        athletesResult.rows,
        playtimeTracker
      );

    } else {
      throw new AppError('type must be individual, line, or situation', 400);
    }

    const { entry: added, mergeAlerts } = gameState.addToQueue(entry);
    await saveGameStateSnapshot(gameId, req.coachId, gameState);
    broadcastGameUpdate(gameId, 'queue_update', { subQueue: gameState.subQueue, mergeAlerts });

    res.json({ success: true, entry: added, subQueue: gameState.subQueue, mergeAlerts });
  })
);

/**
 * DELETE /:gameId/sub-queue/:queueId
 * Remove an entire queue entry.
 */
router.delete(
  '/:gameId/sub-queue/:queueId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId, queueId } = req.params;
    const gameState = gameStates.get(gameId);
    if (!gameState) throw new AppError('Game not initialized', 400);

    gameState.removeFromQueue(queueId);
    await saveGameStateSnapshot(gameId, req.coachId, gameState);
    broadcastGameUpdate(gameId, 'queue_update', { subQueue: gameState.subQueue, mergeAlerts: [] });

    res.json({ success: true, subQueue: gameState.subQueue });
  })
);

/**
 * DELETE /:gameId/sub-queue/:queueId/moves/:moveId
 * Remove a single move from a queue entry.
 */
router.delete(
  '/:gameId/sub-queue/:queueId/moves/:moveId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId, queueId, moveId } = req.params;
    const gameState = gameStates.get(gameId);
    if (!gameState) throw new AppError('Game not initialized', 400);

    gameState.removeMoveFromQueue(queueId, moveId);
    await saveGameStateSnapshot(gameId, req.coachId, gameState);
    broadcastGameUpdate(gameId, 'queue_update', { subQueue: gameState.subQueue, mergeAlerts: [] });

    res.json({ success: true, subQueue: gameState.subQueue });
  })
);

/**
 * POST /:gameId/batch-sub
 * Validate and execute all staged queue entries atomically.
 */
router.post(
  '/:gameId/batch-sub',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const gameState = gameStates.get(gameId);
    if (!gameState) throw new AppError('Game not initialized', 400);

    const result = gameState.executeBatchSub();
    if (!result.success) {
      return res.status(400).json({ success: false, errors: result.errors });
    }

    const playtimeTracker = playtimeTrackers.get(gameId);
    const now = Date.now();

    // Record playtime for each move
    if (playtimeTracker) {
      for (const move of result.executedMoves) {
        playtimeTracker.subOut(move.playerOut, now);
        playtimeTracker.subIn(move.playerIn, now);
      }
    }

    // Persist individual sub events for each move
    for (const move of result.executedMoves) {
      persistGameEvent(gameId, {
        type:      'PLAYER_SUBBED_IN',
        athleteId: move.playerIn,
        timestamp: move.timestamp,
        period:    gameState.period,
        clockTime: gameState.clockTime,
      });
      persistGameEvent(gameId, {
        type:      'PLAYER_SUBBED_OUT',
        athleteId: move.playerOut,
        timestamp: move.timestamp,
        period:    gameState.period,
        clockTime: gameState.clockTime,
      });
    }

    await saveGameStateSnapshot(gameId, req.coachId, gameState);

    broadcastGameUpdate(gameId, 'batch_substitution', {
      event: result.event,
      state: gameState.getState(),
    });

    logger.info(`Batch sub activated: ${gameId}, ${result.executedMoves.length} moves`);

    res.json({
      success: true,
      event:   result.event,
      state:   gameState.getState(),
    });
  })
);

export default router;
