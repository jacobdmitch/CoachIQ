import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { query } from '../services/database.js';
import logger from '../services/logger.js';

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
       g.id, g.opponent, g.game_date, g.location, g.format,
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
  const { teamId, opponent, gameDate, location, format = 'standard', notes } = req.body;
  if (!teamId || !opponent) throw new AppError('teamId and opponent are required.', 400);

  await requireTeamAccess(req.coachId, teamId);

  const result = await query(
    `INSERT INTO games (team_id, opponent, game_date, location, format, status, notes)
     VALUES ($1, $2, $3, $4, $5, 'scheduled', $6) RETURNING *`,
    [teamId, opponent, gameDate || null, location || null, format, notes || null]
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

  const allowed = ['opponent', 'game_date', 'location', 'format', 'score_home', 'score_away', 'status', 'notes'];
  const keyMap  = { gameDate: 'game_date', scoreHome: 'score_home', scoreAway: 'score_away' };

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

  res.json({ success: true, game: updated.rows[0] });
}));

export default router;
