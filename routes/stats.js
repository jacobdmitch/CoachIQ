import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { query } from '../services/database.js';

const router = express.Router();

// ─── GET /api/stats/game/:gameId ──────────────────────────────────────────────
// Returns all game events for a game, aggregated per athlete.
// Used post-game and for AI context when building season stat summaries.

router.get(
  '/game/:gameId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;

    // Verify coach owns this game's team
    const accessCheck = await query(
      `SELECT g.id FROM games g
       JOIN teams t ON g.team_id = t.id
       WHERE g.id = $1 AND t.coach_id = $2`,
      [gameId, req.coachId]
    );
    if (accessCheck.rows.length === 0) {
      throw new AppError('Game not found or access denied.', 403);
    }

    // Per-athlete event counts for this game
    const athleteStatsResult = await query(
      `SELECT
         a.id            AS athlete_id,
         a.first_name,
         a.last_name,
         a.jersey_number,
         a.primary_position,
         COUNT(CASE WHEN ge.event_type = 'goal'            THEN 1 END) AS goals,
         COUNT(CASE WHEN ge.event_type = 'assist'          THEN 1 END) AS assists,
         COUNT(CASE WHEN ge.event_type = 'shot'            THEN 1 END) AS shots,
         COUNT(CASE WHEN ge.event_type = 'shot_on_goal'    THEN 1 END) AS shots_on_goal,
         COUNT(CASE WHEN ge.event_type = 'ground_ball'     THEN 1 END) AS ground_balls,
         COUNT(CASE WHEN ge.event_type = 'turnover'        THEN 1 END) AS turnovers,
         COUNT(CASE WHEN ge.event_type = 'caused_turnover' THEN 1 END) AS caused_turnovers,
         COUNT(CASE WHEN ge.event_type = 'save'            THEN 1 END) AS saves,
         COUNT(CASE WHEN ge.event_type = 'faceoff_win'     THEN 1 END) AS faceoff_wins,
         COUNT(CASE WHEN ge.event_type = 'faceoff_loss'    THEN 1 END) AS faceoff_losses,
         COALESCE(SUM(pl.minutes_played), 0)                            AS minutes_played
       FROM athletes a
       LEFT JOIN game_events ge ON a.id = ge.athlete_id AND ge.game_id = $1
       LEFT JOIN playtime_log pl ON a.id = pl.athlete_id AND pl.game_id = $1
       WHERE a.team_id = (SELECT team_id FROM games WHERE id = $1)
       GROUP BY a.id, a.first_name, a.last_name, a.jersey_number, a.primary_position
       ORDER BY (
         COUNT(CASE WHEN ge.event_type = 'goal'   THEN 1 END) +
         COUNT(CASE WHEN ge.event_type = 'assist' THEN 1 END)
       ) DESC`,
      [gameId]
    );

    // Team-level totals for this game
    const totalsResult = await query(
      `SELECT
         COUNT(CASE WHEN event_type = 'goal'            THEN 1 END) AS goals,
         COUNT(CASE WHEN event_type = 'assist'          THEN 1 END) AS assists,
         COUNT(CASE WHEN event_type = 'shot'            THEN 1 END) AS shots,
         COUNT(CASE WHEN event_type = 'ground_ball'     THEN 1 END) AS ground_balls,
         COUNT(CASE WHEN event_type = 'turnover'        THEN 1 END) AS turnovers,
         COUNT(CASE WHEN event_type = 'faceoff_win'     THEN 1 END) AS faceoff_wins,
         COUNT(CASE WHEN event_type = 'faceoff_loss'    THEN 1 END) AS faceoff_losses
       FROM game_events
       WHERE game_id = $1`,
      [gameId]
    );

    res.json({
      success: true,
      gameId,
      athletes: athleteStatsResult.rows,
      totals: totalsResult.rows[0],
    });
  })
);

// ─── GET /api/stats/athlete/:athleteId ────────────────────────────────────────
// Season stats for a single athlete (reads from the athlete_season_stats view).

router.get(
  '/athlete/:athleteId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { athleteId } = req.params;

    // Verify coach owns this athlete's team
    const accessCheck = await query(
      `SELECT a.id FROM athletes a
       JOIN teams t ON a.team_id = t.id
       WHERE a.id = $1 AND t.coach_id = $2`,
      [athleteId, req.coachId]
    );
    if (accessCheck.rows.length === 0) {
      throw new AppError('Athlete not found or access denied.', 403);
    }

    const result = await query(
      `SELECT
         aps.*,
         ROUND(
           CASE WHEN aps.shots > 0
             THEN aps.goals::numeric / aps.shots * 100
             ELSE 0
           END, 1
         ) AS shot_pct,
         ROUND(
           CASE WHEN (aps.faceoff_wins + aps.faceoff_losses) > 0
             THEN aps.faceoff_wins::numeric / (aps.faceoff_wins + aps.faceoff_losses) * 100
             ELSE 0
           END, 1
         ) AS faceoff_pct
       FROM athlete_season_stats aps
       WHERE aps.athlete_id = $1`,
      [athleteId]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, athleteId, stats: null });
    }

    res.json({
      success: true,
      athleteId,
      stats: result.rows[0],
    });
  })
);

// ─── POST /api/stats/game/:gameId/event ───────────────────────────────────────
// Log a stat event during a game. Thin wrapper over game_events for callers
// that don't go through game-live (e.g., post-game stat corrections).

router.post(
  '/game/:gameId/event',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;
    const { athleteId, eventType, period, clockSeconds } = req.body;

    if (!athleteId || !eventType || !period) {
      throw new AppError('athleteId, eventType, and period are required.', 400);
    }

    const ALLOWED_TYPES = [
      'goal', 'assist', 'shot', 'shot_on_goal',
      'ground_ball', 'turnover', 'caused_turnover',
      'save', 'penalty', 'faceoff_win', 'faceoff_loss',
    ];
    if (!ALLOWED_TYPES.includes(eventType)) {
      throw new AppError(`eventType must be one of: ${ALLOWED_TYPES.join(', ')}`, 400);
    }

    // Verify access
    const accessCheck = await query(
      `SELECT g.id FROM games g
       JOIN teams t ON g.team_id = t.id
       WHERE g.id = $1 AND t.coach_id = $2`,
      [gameId, req.coachId]
    );
    if (accessCheck.rows.length === 0) {
      throw new AppError('Game not found or access denied.', 403);
    }

    const result = await query(
      `INSERT INTO game_events (game_id, athlete_id, event_type, period, game_clock_seconds)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [gameId, athleteId, eventType, period, clockSeconds || null]
    );

    res.status(201).json({
      success: true,
      event: result.rows[0],
    });
  })
);

export default router;
