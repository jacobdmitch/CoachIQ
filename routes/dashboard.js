import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { query } from '../services/database.js';

const router = express.Router();

// ─── GET /season/:teamId ──────────────────────────────────────────────────────

router.get('/season/:teamId', authenticateToken, asyncHandler(async (req, res) => {
  const { teamId } = req.params;

  // Verify team access
  const teamResult = await query(
    'SELECT * FROM teams WHERE id = $1 AND coach_id = $2',
    [teamId, req.coachId]
  );
  if (teamResult.rows.length === 0) {
    throw new AppError('Team not found or access denied.', 403);
  }

  // Season record
  const recordResult = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'completed')                        AS games_played,
       COUNT(*) FILTER (WHERE status = 'completed' AND score_home > score_away) AS wins,
       COUNT(*) FILTER (WHERE status = 'completed' AND score_home < score_away) AS losses,
       COUNT(*) FILTER (WHERE status = 'completed' AND score_home = score_away) AS ties,
       COUNT(*) FILTER (WHERE status = 'scheduled')                        AS upcoming
     FROM games WHERE team_id = $1`,
    [teamId]
  );
  const record = recordResult.rows[0];

  // Team offensive stats
  const statsResult = await query(
    `SELECT
       ROUND(AVG(score_home)::numeric, 1)                    AS avg_goals_for,
       ROUND(AVG(score_away)::numeric, 1)                    AS avg_goals_against,
       COUNT(*) FILTER (WHERE score_home > score_away) * 100.0
         / NULLIF(COUNT(*) FILTER (WHERE status = 'completed'), 0)
                                                              AS win_pct
     FROM games WHERE team_id = $1 AND status = 'completed'`,
    [teamId]
  );
  const stats = statsResult.rows[0];

  // Roster count
  const rosterResult = await query(
    `SELECT
       COUNT(*)                                          AS total,
       COUNT(*) FILTER (WHERE status = 'active')        AS active,
       COUNT(*) FILTER (WHERE status = 'injured')       AS injured
     FROM athletes WHERE team_id = $1`,
    [teamId]
  );
  const roster = rosterResult.rows[0];

  // Recent games (last 5)
  const recentResult = await query(
    `SELECT id, opponent, game_date, score_home, score_away, status,
       CASE
         WHEN score_home > score_away THEN 'W'
         WHEN score_home < score_away THEN 'L'
         ELSE 'T'
       END AS result
     FROM games
     WHERE team_id = $1 AND status = 'completed'
     ORDER BY game_date DESC LIMIT 5`,
    [teamId]
  );

  // Top scorers (season)
  const topScorersResult = await query(
    `SELECT
       a.id, a.first_name, a.last_name, a.jersey_number, a.primary_position,
       COALESCE(aps.total_goals, 0)   AS goals,
       COALESCE(aps.total_assists, 0) AS assists
     FROM athletes a
     LEFT JOIN athlete_performance_summary aps ON a.id = aps.athlete_id
     WHERE a.team_id = $1
     ORDER BY (COALESCE(aps.total_goals, 0) + COALESCE(aps.total_assists, 0)) DESC
     LIMIT 5`,
    [teamId]
  );

  res.json({
    success: true,
    dashboard: {
      team:        teamResult.rows[0],
      record:      { ...record, winPct: stats.win_pct ? Math.round(parseFloat(stats.win_pct)) : 0 },
      stats:       { avgGoalsFor: stats.avg_goals_for, avgGoalsAgainst: stats.avg_goals_against },
      roster,
      recentGames: recentResult.rows,
      topScorers:  topScorersResult.rows,
    },
  });
}));

export default router;
