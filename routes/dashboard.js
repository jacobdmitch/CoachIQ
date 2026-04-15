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
       COALESCE(aps.goals, 0)   AS goals,
       COALESCE(aps.assists, 0) AS assists
     FROM athletes a
     LEFT JOIN athlete_season_stats aps ON a.id = aps.athlete_id
     WHERE a.team_id = $1
     ORDER BY (COALESCE(aps.goals, 0) + COALESCE(aps.assists, 0)) DESC
     LIMIT 5`,
    [teamId]
  );

  // Playtime equity — total minutes per active athlete across all completed games
  const playtimeResult = await query(
    `SELECT
       a.id            AS athlete_id,
       a.first_name,
       a.last_name,
       a.jersey_number,
       a.primary_position,
       COALESCE(SUM(pl.minutes_played), 0) AS total_minutes,
       COUNT(DISTINCT pl.game_id)           AS games_played
     FROM athletes a
     LEFT JOIN playtime_log pl ON a.id = pl.athlete_id
       AND pl.game_id IN (SELECT id FROM games WHERE team_id = $1 AND status = 'completed')
     WHERE a.team_id = $1 AND a.status = 'active'
     GROUP BY a.id, a.first_name, a.last_name, a.jersey_number, a.primary_position
     ORDER BY total_minutes DESC`,
    [teamId]
  );
  const playtimeRows = playtimeResult.rows;

  // Average minutes across the roster to identify outliers
  const totalMinutesSum = playtimeRows.reduce((sum, r) => sum + parseFloat(r.total_minutes), 0);
  const avgMinutes = playtimeRows.length > 0 ? totalMinutesSum / playtimeRows.length : 0;
  const gamesPlayed = parseInt(record.games_played) || 0;

  // Flag athletes with < 40% of team average playtime (only meaningful after games are played)
  const playtimeFlags = gamesPlayed > 0
    ? playtimeRows
        .filter(r => parseFloat(r.total_minutes) < avgMinutes * 0.4)
        .map(r => ({
          athleteId:    r.athlete_id,
          name:         `${r.first_name} ${r.last_name}`,
          jerseyNumber: r.jersey_number,
          totalMinutes: parseFloat(r.total_minutes),
          flag:         'below_threshold',
          message:      `${parseFloat(r.total_minutes).toFixed(0)} min total — below team avg (${avgMinutes.toFixed(0)} min)`,
        }))
    : [];

  res.json({
    success: true,
    dashboard: {
      team:          teamResult.rows[0],
      record:        { ...record, winPct: stats.win_pct ? Math.round(parseFloat(stats.win_pct)) : 0 },
      stats:         { avgGoalsFor: stats.avg_goals_for, avgGoalsAgainst: stats.avg_goals_against },
      roster,
      recentGames:   recentResult.rows,
      topScorers:    topScorersResult.rows,
      playtimeEquity: playtimeRows.map(r => ({
        athleteId:    r.athlete_id,
        firstName:    r.first_name,
        lastName:     r.last_name,
        jerseyNumber: r.jersey_number,
        position:     r.primary_position,
        totalMinutes: parseFloat(r.total_minutes),
        gamesPlayed:  parseInt(r.games_played),
      })),
      playtimeFlags,
      avgMinutes:    parseFloat(avgMinutes.toFixed(1)),
    },
  });
}));

export default router;
