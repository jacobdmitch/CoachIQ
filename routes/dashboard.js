import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { query } from '../services/database.js';

const router = express.Router();

// ─── GET /season/:teamId ──────────────────────────────────────────────────────

router.get('/season/:teamId', authenticateToken, asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const { seasonId } = req.query;

  // Verify team access
  const teamResult = await query(
    'SELECT * FROM teams WHERE id = $1 AND coach_id = $2',
    [teamId, req.coachId]
  );
  if (teamResult.rows.length === 0) {
    throw new AppError('Team not found or access denied.', 403);
  }

  // Validate optional seasonId belongs to this team. When omitted, all the
  // per-game queries fall back to team-wide totals (legacy behavior).
  if (seasonId) {
    const seasonCheck = await query(
      'SELECT id FROM seasons WHERE id = $1 AND team_id = $2',
      [seasonId, teamId]
    );
    if (seasonCheck.rows.length === 0) {
      throw new AppError('Season not found for this team.', 404);
    }
  }

  // A single predicate appended to every games-scoped query. When seasonId is
  // present, `$2::uuid = g.season_id`; when absent, TRUE.
  const seasonFilter = seasonId ? 'AND g.season_id = $2::uuid' : '';
  const scopedArgs   = seasonId ? [teamId, seasonId] : [teamId];

  // Season record
  const recordResult = await query(
    `SELECT
       COUNT(*) FILTER (WHERE g.status = 'completed')                                  AS games_played,
       COUNT(*) FILTER (WHERE g.status = 'completed' AND g.score_home > g.score_away)  AS wins,
       COUNT(*) FILTER (WHERE g.status = 'completed' AND g.score_home < g.score_away)  AS losses,
       COUNT(*) FILTER (WHERE g.status = 'completed' AND g.score_home = g.score_away)  AS ties,
       COUNT(*) FILTER (WHERE g.status = 'scheduled')                                  AS upcoming
     FROM games g WHERE g.team_id = $1 ${seasonFilter}`,
    scopedArgs
  );
  const record = recordResult.rows[0];

  // Team offensive stats
  const statsResult = await query(
    `SELECT
       ROUND(AVG(g.score_home)::numeric, 1)                    AS avg_goals_for,
       ROUND(AVG(g.score_away)::numeric, 1)                    AS avg_goals_against,
       COUNT(*) FILTER (WHERE g.score_home > g.score_away) * 100.0
         / NULLIF(COUNT(*) FILTER (WHERE g.status = 'completed'), 0)
                                                                AS win_pct
     FROM games g WHERE g.team_id = $1 AND g.status = 'completed' ${seasonFilter}`,
    scopedArgs
  );
  const stats = statsResult.rows[0];

  // Roster count — current snapshot, not season-scoped. Athletes don't carry
  // historical status per season, so this reflects today's roster regardless
  // of which season is being viewed.
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
    `SELECT g.id, g.opponent, g.game_date, g.score_home, g.score_away, g.status,
       CASE
         WHEN g.score_home > g.score_away THEN 'W'
         WHEN g.score_home < g.score_away THEN 'L'
         ELSE 'T'
       END AS result
     FROM games g
     WHERE g.team_id = $1 AND g.status = 'completed' ${seasonFilter}
     ORDER BY g.game_date DESC LIMIT 5`,
    scopedArgs
  );

  // Top scorers — season-scoped when seasonId is provided; otherwise fall
  // back to the all-time view to preserve prior behavior.
  const topScorersResult = seasonId
    ? await query(
        `SELECT
           a.id, a.first_name, a.last_name, a.jersey_number, a.primary_position,
           COUNT(*) FILTER (WHERE ge.event_type = 'goal')   AS goals,
           COUNT(*) FILTER (WHERE ge.event_type = 'assist') AS assists
         FROM athletes a
         LEFT JOIN game_events ge ON ge.athlete_id = a.id
         LEFT JOIN games g        ON g.id = ge.game_id AND g.season_id = $2::uuid
         WHERE a.team_id = $1
         GROUP BY a.id
         ORDER BY (COUNT(*) FILTER (WHERE ge.event_type IN ('goal','assist'))) DESC
         LIMIT 5`,
        [teamId, seasonId]
      )
    : await query(
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

  // Playtime equity — total minutes per active athlete across completed games
  // in the selected season (or all-time when none specified).
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
       AND pl.game_id IN (
         SELECT g.id FROM games g
          WHERE g.team_id = $1 AND g.status = 'completed' ${seasonFilter}
       )
     WHERE a.team_id = $1 AND a.status = 'active'
     GROUP BY a.id, a.first_name, a.last_name, a.jersey_number, a.primary_position
     ORDER BY total_minutes DESC`,
    scopedArgs
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
