import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { query } from '../services/database.js';
import logger from '../services/logger.js';
import { sendPostGameSummaries } from '../services/emailService.js';

const router = express.Router();

async function requireTeamAccess(coachId, teamId) {
  const result = await query(
    'SELECT id FROM teams WHERE id = $1 AND coach_id = $2',
    [teamId, coachId]
  );
  if (result.rows.length === 0) throw new AppError('Team not found or access denied.', 403);
}

// ─── GET / — games for a team ─────────────────────────────────────────────────

router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { teamId, status, limit = 20, offset = 0 } = req.query;
  if (!teamId) throw new AppError('teamId query param required', 400);

  await requireTeamAccess(req.coachId, teamId);

  const conditions = ['g.team_id = $1'];
  const values     = [teamId];
  let   idx        = 2;

  if (status) {
    conditions.push(`g.status = $${idx++}`);
    values.push(status);
  }

  values.push(parseInt(limit), parseInt(offset));

  const result = await query(
    `SELECT
       g.id, g.opponent, g.game_date, g.start_time, g.location, g.format,
       g.score_home, g.score_away, g.status, g.notes,
       CASE
         WHEN g.score_home > g.score_away THEN 'W'
         WHEN g.score_home < g.score_away THEN 'L'
         WHEN g.status = 'completed' THEN 'T'
         ELSE NULL
       END AS result
     FROM games g
     WHERE ${conditions.join(' AND ')}
     ORDER BY g.game_date DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    values
  );

  res.json({ success: true, games: result.rows });
}));

// ─── GET /:id — single game ───────────────────────────────────────────────────

router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT g.*,
       CASE
         WHEN g.score_home > g.score_away THEN 'W'
         WHEN g.score_home < g.score_away THEN 'L'
         WHEN g.status = 'completed' THEN 'T'
         ELSE NULL
       END AS result
     FROM games g WHERE g.id = $1`,
    [req.params.id]
  );

  if (result.rows.length === 0) throw new AppError('Game not found', 404);
  const game = result.rows[0];
  await requireTeamAccess(req.coachId, game.team_id);

  res.json({ success: true, game });
}));

// ─── POST / — schedule a game ─────────────────────────────────────────────────

router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const { teamId, opponent, gameDate, startTime, location, format = 'standard', notes } = req.body;
  if (!teamId || !opponent) throw new AppError('teamId and opponent are required.', 400);
  if (!gameDate) throw new AppError('gameDate is required.', 400);

  await requireTeamAccess(req.coachId, teamId);

  const result = await query(
    `INSERT INTO games (team_id, opponent, game_date, start_time, location, format, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7) RETURNING *`,
    [teamId, opponent, gameDate, startTime || null, location || null, format, notes || null]
  );

  logger.info(`Game scheduled: vs ${opponent} for team ${teamId}`);
  res.status(201).json({ success: true, game: result.rows[0] });
}));

// ─── PATCH /:id — update game ─────────────────────────────────────────────────

router.patch('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const gameResult = await query('SELECT * FROM games WHERE id = $1', [req.params.id]);
  if (gameResult.rows.length === 0) throw new AppError('Game not found', 404);

  const game = gameResult.rows[0];
  await requireTeamAccess(req.coachId, game.team_id);

  const allowed = ['opponent', 'game_date', 'start_time', 'location', 'format', 'score_home', 'score_away', 'status', 'notes'];
  const keyMap  = { gameDate: 'game_date', startTime: 'start_time', scoreHome: 'score_home', scoreAway: 'score_away' };

  const fields = [];
  const values = [];
  let   idx    = 1;

  for (const [key, val] of Object.entries(req.body)) {
    const col = keyMap[key] || key;
    if (allowed.includes(col)) {
      fields.push(`${col} = $${idx++}`);
      values.push(val);
    }
  }

  if (fields.length === 0) throw new AppError('No valid fields to update.', 400);

  values.push(req.params.id);
  const updated = await query(
    `UPDATE games SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
    values
  );

  const updatedGame = updated.rows[0];

  // Fire post-game summary emails when a game is marked completed
  if (req.body.status === 'completed' && game.status !== 'completed') {
    try {
      const [athleteStats, teamRow] = await Promise.all([
        query(
          `SELECT
             a.id AS athlete_id, a.first_name, a.last_name, a.email, a.send_game_summary,
             COUNT(CASE WHEN ge.event_type = 'goal'            THEN 1 END) AS goals,
             COUNT(CASE WHEN ge.event_type = 'assist'          THEN 1 END) AS assists,
             COUNT(CASE WHEN ge.event_type = 'shot'            THEN 1 END) AS shots,
             COUNT(CASE WHEN ge.event_type = 'ground_ball'     THEN 1 END) AS ground_balls,
             COUNT(CASE WHEN ge.event_type = 'turnover'        THEN 1 END) AS turnovers,
             COUNT(CASE WHEN ge.event_type = 'save'            THEN 1 END) AS saves,
             COUNT(CASE WHEN ge.event_type = 'faceoff_win'     THEN 1 END) AS faceoff_wins,
             COUNT(CASE WHEN ge.event_type = 'faceoff_loss'    THEN 1 END) AS faceoff_losses,
             COALESCE(SUM(pl.minutes_played), 0)                            AS minutes_played
           FROM athletes a
           LEFT JOIN game_events ge ON a.id = ge.athlete_id AND ge.game_id = $1
           LEFT JOIN playtime_log pl ON a.id = pl.athlete_id AND pl.game_id = $1
           WHERE a.team_id = $2 AND a.send_game_summary = true AND a.email IS NOT NULL
           GROUP BY a.id, a.first_name, a.last_name, a.email, a.send_game_summary`,
          [req.params.id, updatedGame.team_id]
        ),
        query('SELECT name FROM teams WHERE id = $1', [updatedGame.team_id]),
      ]);

      const teamName = teamRow.rows[0]?.name || 'Your Team';
      // Fire-and-forget — don't block the HTTP response on email delivery
      sendPostGameSummaries(updatedGame, athleteStats.rows, teamName).catch(err =>
        logger.error(`Post-game email error: ${err.message}`)
      );
    } catch (err) {
      logger.error(`Failed to fetch data for post-game emails: ${err.message}`);
    }
  }

  res.json({ success: true, game: updatedGame });
}));

// ─── GET /:gameId/situation-assignments ──────────────────────────────────────

router.get('/:gameId/situation-assignments', authenticateToken, asyncHandler(async (req, res) => {
  const gameResult = await query('SELECT team_id FROM games WHERE id = $1', [req.params.gameId]);
  if (gameResult.rows.length === 0) throw new AppError('Game not found', 404);
  await requireTeamAccess(req.coachId, gameResult.rows[0].team_id);

  const result = await query(
    'SELECT * FROM game_situation_assignments WHERE game_id = $1 ORDER BY situation_type',
    [req.params.gameId]
  );
  res.json({ success: true, assignments: result.rows });
}));

// ─── PUT /:gameId/situation-assignments/:situationType ────────────────────────

router.put('/:gameId/situation-assignments/:situationType', authenticateToken, asyncHandler(async (req, res) => {
  const { gameId, situationType } = req.params;
  const { playerIds } = req.body;

  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    throw new AppError('playerIds must be a non-empty array', 400);
  }

  const gameResult = await query('SELECT team_id FROM games WHERE id = $1', [gameId]);
  if (gameResult.rows.length === 0) throw new AppError('Game not found', 404);
  await requireTeamAccess(req.coachId, gameResult.rows[0].team_id);

  const result = await query(
    `INSERT INTO game_situation_assignments (game_id, situation_type, player_ids)
     VALUES ($1, $2, $3)
     ON CONFLICT (game_id, situation_type)
     DO UPDATE SET player_ids = $3, updated_at = NOW()
     RETURNING *`,
    [gameId, situationType, playerIds]
  );

  res.json({ success: true, assignment: result.rows[0] });
}));

// ─── DELETE /:gameId/situation-assignments/:situationType ─────────────────────

router.delete('/:gameId/situation-assignments/:situationType', authenticateToken, asyncHandler(async (req, res) => {
  const { gameId, situationType } = req.params;

  const gameResult = await query('SELECT team_id FROM games WHERE id = $1', [gameId]);
  if (gameResult.rows.length === 0) throw new AppError('Game not found', 404);
  await requireTeamAccess(req.coachId, gameResult.rows[0].team_id);

  await query(
    'DELETE FROM game_situation_assignments WHERE game_id = $1 AND situation_type = $2',
    [gameId, situationType]
  );

  res.json({ success: true });
}));

export default router;
