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

const scoreSchema = z.object({
  team: z.enum(['home', 'away']),
  points: z.number().int().min(0),
});

const router = express.Router();

// In-memory game state storage (for production use Redis)
const gameStates = new Map();
const playtimeTrackers = new Map();

/**
 * POST /:gameId/start
 * Start a game and initialize GameStateManager
 */
router.post(
  '/:gameId/start',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;

    // Fetch game from database
    const gameResult = await query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (gameResult.rows.length === 0) {
      throw new AppError('Game not found', 404);
    }
    const game = gameResult.rows[0];

    // Fetch roster
    const rosterResult = await query(
      'SELECT * FROM athletes WHERE team_id = $1',
      [game.team_id]
    );
    const athletes = rosterResult.rows;

    // Initialize game state manager
    const gameState = new GameStateManager(game, athletes);
    gameState.period = 1;
    gameState.state = 'ACTIVE';

    gameStates.set(gameId, gameState);

    // Initialize playtime tracker
    const playtimeTracker = new PlaytimeTracker(athletes, 15); // 15 min target
    playtimeTrackers.set(gameId, playtimeTracker);

    // Persist initial state snapshot for recovery
    await saveGameStateSnapshot(gameId, req.coachId, gameState);

    logger.info(`Game started: ${gameId}`, { format: game.format });

    res.json({
      success: true,
      gameId,
      state: gameState.getState(),
    });
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

    // Clean up memory
    gameStates.delete(gameId);
    playtimeTrackers.delete(gameId);

    logger.info(`Game ended: ${gameId}`);

    res.json({
      success: true,
      finalState: gameState.getState(),
    });
  })
);

export default router;
