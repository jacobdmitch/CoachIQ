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

    // Per-athlete (home side) event counts for this game
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
       LEFT JOIN game_events ge
              ON a.id = ge.athlete_id
             AND ge.game_id = $1
             AND ge.team_side = 'home'
       LEFT JOIN playtime_log pl ON a.id = pl.athlete_id AND pl.game_id = $1
       WHERE a.team_id = (SELECT team_id FROM games WHERE id = $1)
       GROUP BY a.id, a.first_name, a.last_name, a.jersey_number, a.primary_position
       ORDER BY (
         COUNT(CASE WHEN ge.event_type = 'goal'   THEN 1 END) +
         COUNT(CASE WHEN ge.event_type = 'assist' THEN 1 END)
       ) DESC`,
      [gameId]
    );

    // Per-opposing-player event counts for this game (away side)
    const opponentStatsResult = await query(
      `SELECT
         op.id            AS opposing_player_id,
         op.display_name,
         op.jersey_number,
         op.primary_position,
         COUNT(CASE WHEN ge.event_type = 'goal'            THEN 1 END) AS goals,
         COUNT(CASE WHEN ge.event_type = 'assist'          THEN 1 END) AS assists,
         COUNT(CASE WHEN ge.event_type = 'shot'            THEN 1 END) AS shots,
         COUNT(CASE WHEN ge.event_type = 'shot_on_goal'    THEN 1 END) AS shots_on_goal,
         COUNT(CASE WHEN ge.event_type = 'ground_ball'     THEN 1 END) AS ground_balls,
         COUNT(CASE WHEN ge.event_type = 'turnover'        THEN 1 END) AS turnovers,
         COUNT(CASE WHEN ge.event_type = 'caused_turnover' THEN 1 END) AS caused_turnovers,
         COUNT(CASE WHEN ge.event_type = 'save'            THEN 1 END) AS saves,
         COUNT(CASE WHEN ge.event_type = 'faceoff_win'     THEN 1 END) AS faceoff_wins,
         COUNT(CASE WHEN ge.event_type = 'faceoff_loss'    THEN 1 END) AS faceoff_losses
       FROM opposing_players op
       JOIN opposing_teams ot ON op.opposing_team_id = ot.id
       JOIN games g           ON g.opposing_team_id  = ot.id
       LEFT JOIN game_events ge
              ON ge.opposing_player_id = op.id
             AND ge.game_id            = $1
             AND ge.team_side          = 'away'
       WHERE g.id = $1
       GROUP BY op.id, op.display_name, op.jersey_number, op.primary_position
       ORDER BY (
         COUNT(CASE WHEN ge.event_type = 'goal'   THEN 1 END) +
         COUNT(CASE WHEN ge.event_type = 'assist' THEN 1 END)
       ) DESC`,
      [gameId]
    );

    // Team-level totals split by side.
    // Home row includes all home events; away row includes opponent events
    // whether or not they were attributed to a specific opposing player.
    const sideTotalsResult = await query(
      `SELECT
         team_side,
         COUNT(CASE WHEN event_type = 'goal'            THEN 1 END) AS goals,
         COUNT(CASE WHEN event_type = 'assist'          THEN 1 END) AS assists,
         COUNT(CASE WHEN event_type = 'shot'            THEN 1 END) AS shots,
         COUNT(CASE WHEN event_type = 'shot_on_goal'    THEN 1 END) AS shots_on_goal,
         COUNT(CASE WHEN event_type = 'ground_ball'     THEN 1 END) AS ground_balls,
         COUNT(CASE WHEN event_type = 'turnover'        THEN 1 END) AS turnovers,
         COUNT(CASE WHEN event_type = 'caused_turnover' THEN 1 END) AS caused_turnovers,
         COUNT(CASE WHEN event_type = 'save'            THEN 1 END) AS saves,
         COUNT(CASE WHEN event_type = 'faceoff_win'     THEN 1 END) AS faceoff_wins,
         COUNT(CASE WHEN event_type = 'faceoff_loss'    THEN 1 END) AS faceoff_losses,
         COUNT(CASE WHEN event_type = 'penalty'         THEN 1 END) AS penalties
       FROM game_events
       WHERE game_id = $1
       GROUP BY team_side`,
      [gameId]
    );

    const emptyTotals = {
      goals: 0, assists: 0, shots: 0, shots_on_goal: 0,
      ground_balls: 0, turnovers: 0, caused_turnovers: 0,
      saves: 0, faceoff_wins: 0, faceoff_losses: 0, penalties: 0,
    };
    const homeRow    = sideTotalsResult.rows.find(r => r.team_side === 'home');
    const awayRow    = sideTotalsResult.rows.find(r => r.team_side === 'away');
    const homeTotals = homeRow ? { ...emptyTotals, ...homeRow } : { ...emptyTotals };
    const awayTotals = awayRow ? { ...emptyTotals, ...awayRow } : { ...emptyTotals };
    delete homeTotals.team_side;
    delete awayTotals.team_side;

    res.json({
      success: true,
      gameId,
      athletes:      athleteStatsResult.rows,
      opponents:     opponentStatsResult.rows,
      totals:        homeTotals,     // kept for back-compat; home-side only
      homeTotals,
      awayTotals,
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
    const {
      athleteId,
      opposingPlayerId,
      eventType,
      period,
      clockSeconds,
      teamSide,
    } = req.body;

    const resolvedSide = teamSide === 'away' ? 'away' : 'home';

    if (!eventType || !period) {
      throw new AppError('eventType and period are required.', 400);
    }
    if (resolvedSide === 'home' && !athleteId) {
      throw new AppError('athleteId is required for home-side events.', 400);
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

    // If opposingPlayerId provided, verify it belongs to this game's opponent
    if (resolvedSide === 'away' && opposingPlayerId) {
      const verify = await query(
        `SELECT op.id
           FROM opposing_players op
           JOIN opposing_teams ot ON op.opposing_team_id = ot.id
           JOIN games g           ON g.opposing_team_id  = ot.id
          WHERE op.id = $1 AND g.id = $2`,
        [opposingPlayerId, gameId]
      );
      if (verify.rows.length === 0) {
        throw new AppError('opposingPlayerId does not belong to this game\'s opposing team', 400);
      }
    }

    const result = await query(
      `INSERT INTO game_events
         (game_id, athlete_id, event_type, period, game_clock_seconds,
          team_side, opposing_player_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at, team_side, opposing_player_id`,
      [
        gameId,
        resolvedSide === 'home' ? athleteId : null,
        eventType,
        period,
        clockSeconds || null,
        resolvedSide,
        resolvedSide === 'away' ? (opposingPlayerId || null) : null,
      ]
    );

    res.status(201).json({
      success: true,
      event: result.rows[0],
    });
  })
);

export default router;
