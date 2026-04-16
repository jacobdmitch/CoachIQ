import express from 'express';
import crypto from 'crypto';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { query } from '../services/database.js';
import logger from '../services/logger.js';

const router = express.Router();

/**
 * Public share surface + share-token management.
 *
 * Two router families live here:
 *   GET  /api/public/player/:token       → read-only season stats (no auth)
 *   POST /api/public/athletes/:id/share  → coach-only: mint a token
 *   GET  /api/public/athletes/:id/share  → coach-only: list active tokens
 *   DEL  /api/public/athletes/:id/share  → coach-only: revoke all tokens
 *
 * Keeping the mint / list / revoke routes under /api/public makes deploys
 * straightforward (one file) while still requiring a JWT for them. The
 * token-view route is the only truly unauthenticated endpoint.
 */

async function requireTeamAccess(coachId, teamId) {
  const result = await query(
    'SELECT id FROM teams WHERE id = $1 AND coach_id = $2',
    [teamId, coachId]
  );
  if (result.rows.length === 0) throw new AppError('Team not found or access denied', 403);
}

// ─── GET /player/:token — PUBLIC read-only season stats ──────────────────────

router.get('/player/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 16 || token.length > 64) {
    throw new AppError('Invalid share link', 404);
  }

  const tokenResult = await query(
    `SELECT st.*, a.id AS athlete_id, a.team_id
     FROM athlete_share_tokens st
     JOIN athletes a ON a.id = st.athlete_id
     WHERE st.token = $1`,
    [token]
  );

  if (tokenResult.rows.length === 0) {
    throw new AppError('Share link not found', 404);
  }
  const row = tokenResult.rows[0];
  if (row.revoked_at) throw new AppError('Share link revoked', 410);
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    throw new AppError('Share link expired', 410);
  }

  // Bump view counter (best-effort; don't fail the read on a counter error)
  query(
    `UPDATE athlete_share_tokens
     SET view_count = view_count + 1, last_viewed_at = NOW()
     WHERE id = $1`,
    [row.id]
  ).catch(() => {});

  // Minimal athlete fields — name, jersey, position, grad year. No email,
  // no notes, no skill ratings (those are coach-facing).
  const athleteResult = await query(
    `SELECT a.id, a.first_name, a.last_name, a.jersey_number,
            a.primary_position, a.secondary_position, a.graduation_year,
            t.team_name,
            COALESCE(aps.games_participated, 0) AS games_played,
            COALESCE(aps.goals, 0)              AS goals,
            COALESCE(aps.assists, 0)            AS assists,
            COALESCE(aps.shots, 0)              AS shots,
            COALESCE(aps.shots_on_goal, 0)      AS shots_on_goal,
            COALESCE(aps.ground_balls, 0)       AS ground_balls,
            COALESCE(aps.caused_turnovers, 0)   AS caused_turnovers,
            COALESCE(aps.turnovers, 0)          AS turnovers,
            COALESCE(aps.faceoff_wins, 0)       AS faceoff_wins,
            COALESCE(aps.faceoff_losses, 0)     AS faceoff_losses,
            COALESCE(aps.saves, 0)              AS saves,
            COALESCE(aps.total_minutes_played, 0) AS total_minutes_played
     FROM athletes a
     JOIN teams t ON t.id = a.team_id
     LEFT JOIN athlete_season_stats aps ON a.id = aps.athlete_id
     WHERE a.id = $1`,
    [row.athlete_id]
  );

  if (athleteResult.rows.length === 0) throw new AppError('Athlete not found', 404);
  const athlete = athleteResult.rows[0];

  // Per-game breakdown — public-safe (just opponent, date, and this player's
  // counting stats). No team-level strategy or opponent-scouting data.
  const gamesResult = await query(
    `SELECT g.id, g.opponent, g.game_date, g.score_home, g.score_away,
            COUNT(CASE WHEN ge.event_type = 'goal'         THEN 1 END) AS goals,
            COUNT(CASE WHEN ge.event_type = 'assist'       THEN 1 END) AS assists,
            COUNT(CASE WHEN ge.event_type = 'shot'         THEN 1 END) AS shots,
            COUNT(CASE WHEN ge.event_type = 'ground_ball'  THEN 1 END) AS ground_balls,
            COUNT(CASE WHEN ge.event_type = 'caused_turnover' THEN 1 END) AS caused_turnovers,
            COUNT(CASE WHEN ge.event_type = 'save'         THEN 1 END) AS saves
     FROM games g
     LEFT JOIN game_events ge
            ON ge.game_id = g.id
           AND ge.athlete_id = $1
     WHERE g.team_id = $2 AND g.status = 'completed'
     GROUP BY g.id
     ORDER BY g.game_date DESC
     LIMIT 50`,
    [row.athlete_id, athlete.team_id || null]
  );

  res.json({
    success: true,
    athlete: {
      id: athlete.id,
      firstName: athlete.first_name,
      lastName:  athlete.last_name,
      jerseyNumber:       athlete.jersey_number,
      primaryPosition:    athlete.primary_position,
      secondaryPosition:  athlete.secondary_position,
      graduationYear:     athlete.graduation_year,
      teamName:           athlete.team_name,
    },
    season: {
      gamesPlayed:          Number(athlete.games_played),
      goals:                Number(athlete.goals),
      assists:              Number(athlete.assists),
      points:               Number(athlete.goals) + Number(athlete.assists),
      shots:                Number(athlete.shots),
      shotsOnGoal:          Number(athlete.shots_on_goal),
      groundBalls:          Number(athlete.ground_balls),
      causedTurnovers:      Number(athlete.caused_turnovers),
      turnovers:            Number(athlete.turnovers),
      faceoffWins:          Number(athlete.faceoff_wins),
      faceoffLosses:        Number(athlete.faceoff_losses),
      saves:                Number(athlete.saves),
      totalMinutesPlayed:   Number(athlete.total_minutes_played),
    },
    games: gamesResult.rows.map(g => ({
      id: g.id,
      opponent: g.opponent,
      gameDate: g.game_date,
      homeScore: g.score_home,
      awayScore: g.score_away,
      goals:            Number(g.goals),
      assists:          Number(g.assists),
      shots:            Number(g.shots),
      groundBalls:      Number(g.ground_balls),
      causedTurnovers:  Number(g.caused_turnovers),
      saves:            Number(g.saves),
    })),
    expiresAt: row.expires_at,
  });
}));

// ─── POST /athletes/:id/share — mint a share token (coach only) ──────────────

router.post('/athletes/:id/share', authenticateToken, asyncHandler(async (req, res) => {
  const athleteResult = await query(
    'SELECT id, team_id FROM athletes WHERE id = $1',
    [req.params.id]
  );
  if (athleteResult.rows.length === 0) throw new AppError('Athlete not found', 404);
  await requireTeamAccess(req.coachId, athleteResult.rows[0].team_id);

  // 24 random bytes → 32-char base64url token; unguessable.
  const token = crypto.randomBytes(24).toString('base64url');

  // Default lifespan: 180 days. Coach can revoke earlier; parents can
  // bookmark and check periodically through the season without asking.
  const expiresDays = Math.min(Math.max(parseInt(req.body?.expiresDays, 10) || 180, 1), 365);
  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);

  const result = await query(
    `INSERT INTO athlete_share_tokens (token, athlete_id, created_by_coach_id, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, token, expires_at, created_at`,
    [token, req.params.id, req.coachId, expiresAt]
  );

  logger.info(`Share token minted for athlete ${req.params.id}`);
  res.status(201).json({ success: true, share: result.rows[0] });
}));

// ─── GET /athletes/:id/share — list active tokens (coach only) ───────────────

router.get('/athletes/:id/share', authenticateToken, asyncHandler(async (req, res) => {
  const athleteResult = await query(
    'SELECT id, team_id FROM athletes WHERE id = $1',
    [req.params.id]
  );
  if (athleteResult.rows.length === 0) throw new AppError('Athlete not found', 404);
  await requireTeamAccess(req.coachId, athleteResult.rows[0].team_id);

  const result = await query(
    `SELECT id, token, expires_at, revoked_at, last_viewed_at, view_count, created_at
     FROM athlete_share_tokens
     WHERE athlete_id = $1
     ORDER BY created_at DESC`,
    [req.params.id]
  );
  res.json({ success: true, shares: result.rows });
}));

// ─── DELETE /athletes/:id/share — revoke all tokens for this athlete ─────────

router.delete('/athletes/:id/share', authenticateToken, asyncHandler(async (req, res) => {
  const athleteResult = await query(
    'SELECT id, team_id FROM athletes WHERE id = $1',
    [req.params.id]
  );
  if (athleteResult.rows.length === 0) throw new AppError('Athlete not found', 404);
  await requireTeamAccess(req.coachId, athleteResult.rows[0].team_id);

  await query(
    `UPDATE athlete_share_tokens
     SET revoked_at = NOW()
     WHERE athlete_id = $1 AND revoked_at IS NULL`,
    [req.params.id]
  );
  res.json({ success: true });
}));

export default router;
