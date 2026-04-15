import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import logger from '../services/logger.js';
import { query } from '../services/database.js';
import { getLineCoachRecommendation, getPositionRecommendation } from '../services/lineCoachEngine.js';
import { getPositionRecommendations } from '../services/positionEngine.js';
import { logAICall, getGameAIStats, getGameCallHistory } from '../services/aiCallLogger.js';
import { gameStates, playtimeTrackers } from '../services/liveGameStore.js';

const router = express.Router();

// AI-specific rate limit: 30 requests per minute per IP (covers Claude API costs)
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many AI requests. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /recommendations
 * Get Line Coach recommendations for current game state
 * Body: { gameId, focusArea? }
 */
router.post(
  '/recommendations',
  authenticateToken,
  aiRateLimiter,
  asyncHandler(async (req, res) => {
    const { gameId, focusArea } = req.body;
    const startTime = Date.now();

    if (!gameId) {
      throw new AppError('gameId required', 400);
    }

    // Fetch game and state
    const gameResult = await query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (gameResult.rows.length === 0) {
      throw new AppError('Game not found', 404);
    }
    const game = gameResult.rows[0];

    // Get game state (from memory or database)
    const gameState = gameStates.get(gameId) || {
      gameId,
      format: game.format || 'standard',
      state: 'ACTIVE',
      period: 1,
      clockRunning: false,
      clockTime: 0,
      periodDuration: game.format === '6s' ? 12 * 60 : 15 * 60,
      homeScore: game.score_home || 0,
      awayScore: game.score_away || 0,
      fieldPositions: {},
      bench: [],
      events: [],
    };

    // Get playtime data
    const playtimeTracker = playtimeTrackers.get(gameId);
    const playtimeData = playtimeTracker
      ? {
          summary: playtimeTracker.getPlaytimeSummary(),
          flags: playtimeTracker.getEquityFlags(),
        }
      : { summary: [], flags: [] };

    // Get season stats for players
    const statsResult = await query(
      `SELECT athlete_id, goals, assists, shots, ground_balls
       FROM athlete_season_stats
       WHERE team_id = $1
       LIMIT 200`,
      [game.team_id]
    );
    const seasonStats = {};
    statsResult.rows.forEach((row) => {
      seasonStats[row.athlete_id] = {
        goals: row.goals,
        assists: row.assists,
        shots: row.shots,
        groundBalls: row.ground_balls,
      };
    });

    // Call Line Coach AI
    const recommendation = await getLineCoachRecommendation(gameState, playtimeData, {
      format: game.format,
      seasonStats,
      focusArea,
    });

    const latencyMs = Date.now() - startTime;

    // Log API call with actual token counts from response
    await logAICall({
      coachId: req.coachId,
      model: 'claude-haiku-4-5-20251001',
      inputTokens: recommendation.usage?.input_tokens || 0,
      outputTokens: recommendation.usage?.output_tokens || 0,
      latencyMs,
      toolName: 'line-coach',
      gameId,
    });

    logger.info(`Line Coach recommendations generated for game ${gameId}`, {
      suggestionCount: recommendation.suggestions?.length || 0,
      latencyMs,
    });

    res.json({
      success: true,
      recommendation,
      latencyMs,
    });
  })
);

/**
 * POST /position-fit/:athleteId
 * Get position recommendation for an athlete
 * Body: { gameId?, format? }
 */
router.post(
  '/position-fit/:athleteId',
  authenticateToken,
  aiRateLimiter,
  asyncHandler(async (req, res) => {
    const { athleteId } = req.params;
    const { gameId, format = 'standard' } = req.body;
    const startTime = Date.now();

    // Fetch athlete
    const athleteResult = await query(
      'SELECT * FROM athletes WHERE id = $1',
      [athleteId]
    );
    if (athleteResult.rows.length === 0) {
      throw new AppError('Athlete not found', 404);
    }
    const athlete = athleteResult.rows[0];

    // Fetch team roster for context
    const rosterResult = await query(
      'SELECT * FROM athletes WHERE team_id = $1',
      [athlete.team_id]
    );
    const roster = rosterResult.rows;

    // Get position recommendations from engine
    const positionRecs = getPositionRecommendations(athlete, format);

    // Also get Claude analysis
    const claudeAnalysis = await getPositionRecommendation(athlete, roster, format);

    const latencyMs = Date.now() - startTime;

    // Log API call with actual token counts from response
    await logAICall({
      coachId: req.coachId,
      model: 'claude-haiku-4-5-20251001',
      inputTokens: claudeAnalysis.usage?.input_tokens || 0,
      outputTokens: claudeAnalysis.usage?.output_tokens || 0,
      latencyMs,
      toolName: 'position-fit',
      gameId: gameId || null,
    });

    logger.info(`Position fit analysis for athlete ${athleteId}`, {
      primaryPosition: positionRecs.recommendations.primary.position,
      fitScore: positionRecs.recommendations.primary.fitScore,
      latencyMs,
    });

    res.json({
      success: true,
      athleteId,
      athleteName: athlete.name,
      format,
      positionEngine: positionRecs,
      claudeAnalysis: claudeAnalysis.analysis,
      latencyMs,
    });
  })
);

/**
 * GET /conversation/:gameId
 * Get AI call history for the current coach
 */
router.get(
  '/conversation/:gameId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const { limit = 50 } = req.query;

    // Get call history scoped to this game
    const callHistory = await getGameCallHistory(gameId, { limit: parseInt(limit) });

    // Get call statistics for this game
    const stats = await getGameAIStats(gameId);

    res.json({
      success: true,
      gameId,
      stats,
      callHistory,
    });
  })
);

/**
 * GET /stats/:gameId
 * Get AI usage statistics for the current coach
 */
router.get(
  '/stats/:gameId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;

    const stats = await getGameAIStats(gameId);

    res.json({
      success: true,
      gameId,
      stats,
    });
  })
);

/**
 * GET /available-agents
 * List available AI coaching agents
 */
router.get(
  '/available-agents',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      agents: [
        {
          id: 'lineCoach',
          name: 'Line Coach',
          description:
            'Real-time coaching recommendations for substitutions, playtime equity, and tactical adjustments',
          capabilities: [
            'substitution_suggestions',
            'playtime_analysis',
            'lineup_evaluation',
            'position_recommendations',
            'game_alerts',
          ],
          model: 'claude-haiku-4-5-20251001',
          status: 'active',
        },
      ],
    });
  })
);

export default router;
