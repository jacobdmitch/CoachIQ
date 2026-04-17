import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { query } from '../services/database.js';
import { suggestLine, listLineRoles } from '../services/lineBuilder.js';
import logger from '../services/logger.js';

const router = express.Router();

async function requireTeamAccess(coachId, teamId) {
  const result = await query(
    'SELECT id FROM teams WHERE id = $1 AND coach_id = $2',
    [teamId, coachId]
  );
  if (result.rows.length === 0) throw new AppError('Team not found or access denied', 403);
}

// ─── GET /roles — list available line roles for the role picker ──────────────

router.get('/roles', authenticateToken, asyncHandler(async (req, res) => {
  const format = req.query.format === '6s' ? '6s' : 'standard';
  res.json({ success: true, roles: listLineRoles({ format }) });
}));

// ─── GET /suggestions — trait-weighted line suggestion for a role ────────────

router.get('/suggestions', authenticateToken, asyncHandler(async (req, res) => {
  const { teamId, role } = req.query;
  if (!teamId || !role) {
    throw new AppError('teamId and role query params required', 400);
  }
  await requireTeamAccess(req.coachId, teamId);

  const rosterResult = await query(
    `SELECT id, jersey_number, first_name, last_name,
            primary_position, secondary_position, status,
            skill_ground_balls, skill_dodging, skill_shooting,
            skill_passing, skill_defense, skill_faceoff,
            skill_transition, skill_field_awareness
     FROM athletes
     WHERE team_id = $1`,
    [teamId]
  );

  const excludeIds = req.query.exclude
    ? String(req.query.exclude).split(',').filter(Boolean)
    : [];

  try {
    const suggestion = suggestLine(rosterResult.rows, role, { excludeIds });
    res.json({ success: true, ...suggestion });
  } catch (err) {
    throw new AppError(err.message || 'Failed to generate suggestion', 400);
  }
}));

// ─── GET / — list lines for a team ───────────────────────────────────────────

router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { teamId } = req.query;
  if (!teamId) throw new AppError('teamId query param required', 400);
  await requireTeamAccess(req.coachId, teamId);

  const result = await query(
    'SELECT * FROM lines WHERE team_id = $1 ORDER BY position_group, name',
    [teamId]
  );
  res.json({ success: true, lines: result.rows });
}));

// ─── POST / — create a line ───────────────────────────────────────────────────

router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const { teamId, name, positionGroup, playerIds } = req.body;
  if (!teamId || !name || !positionGroup || !Array.isArray(playerIds)) {
    throw new AppError('teamId, name, positionGroup, and playerIds are required', 400);
  }
  await requireTeamAccess(req.coachId, teamId);

  const result = await query(
    `INSERT INTO lines (team_id, name, position_group, player_ids)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [teamId, name, positionGroup, playerIds]
  );

  logger.info(`Line created: "${name}" for team ${teamId}`);
  res.status(201).json({ success: true, line: result.rows[0] });
}));

// ─── PUT /:lineId — update a line ─────────────────────────────────────────────

router.put('/:lineId', authenticateToken, asyncHandler(async (req, res) => {
  const lineResult = await query('SELECT * FROM lines WHERE id = $1', [req.params.lineId]);
  if (lineResult.rows.length === 0) throw new AppError('Line not found', 404);
  await requireTeamAccess(req.coachId, lineResult.rows[0].team_id);

  const { name, positionGroup, playerIds } = req.body;
  const fields = [];
  const values = [];
  let idx = 1;

  if (name !== undefined)        { fields.push(`name = $${idx++}`);           values.push(name); }
  if (positionGroup !== undefined){ fields.push(`position_group = $${idx++}`); values.push(positionGroup); }
  if (Array.isArray(playerIds))  { fields.push(`player_ids = $${idx++}`);      values.push(playerIds); }

  if (fields.length === 0) throw new AppError('No valid fields to update', 400);

  values.push(req.params.lineId);
  const result = await query(
    `UPDATE lines SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
    values
  );

  res.json({ success: true, line: result.rows[0] });
}));

// ─── DELETE /:lineId — delete a line ─────────────────────────────────────────

router.delete('/:lineId', authenticateToken, asyncHandler(async (req, res) => {
  const lineResult = await query('SELECT * FROM lines WHERE id = $1', [req.params.lineId]);
  if (lineResult.rows.length === 0) throw new AppError('Line not found', 404);
  await requireTeamAccess(req.coachId, lineResult.rows[0].team_id);

  await query('DELETE FROM lines WHERE id = $1', [req.params.lineId]);
  res.json({ success: true });
}));

export default router;
