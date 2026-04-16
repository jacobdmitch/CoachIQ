import express from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { query } from '../services/database.js';

const router = express.Router();

// ─── Access helpers ──────────────────────────────────────────────────────────

async function requireTeamAccess(coachId, teamId) {
  const result = await query(
    'SELECT id FROM teams WHERE id = $1 AND coach_id = $2',
    [teamId, coachId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Team not found or access denied.', 403);
  }
}

async function requireOpposingTeamAccess(coachId, opposingTeamId) {
  const result = await query(
    `SELECT ot.id, ot.team_id
       FROM opposing_teams ot
       JOIN teams t ON ot.team_id = t.id
      WHERE ot.id = $1 AND t.coach_id = $2`,
    [opposingTeamId, coachId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Opposing team not found or access denied.', 403);
  }
  return result.rows[0];
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const opposingTeamSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(255),
  notes: z.string().max(4000).optional(),
});

const opposingTeamUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  notes: z.string().max(4000).optional(),
});

const opposingPlayerSchema = z.object({
  opposingTeamId: z.string().uuid(),
  jerseyNumber: z.number().int().min(0).max(999).optional(),
  displayName: z.string().max(120).optional(),
  primaryPosition: z.enum(['Attack', 'Midfield', 'Defense', 'Goalie', 'FOGO']).optional(),
  notes: z.string().max(4000).optional(),
});

const opposingPlayerUpdateSchema = z.object({
  jerseyNumber: z.number().int().min(0).max(999).nullable().optional(),
  displayName: z.string().max(120).nullable().optional(),
  primaryPosition: z.enum(['Attack', 'Midfield', 'Defense', 'Goalie', 'FOGO']).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

// ─── Opposing teams ──────────────────────────────────────────────────────────

/**
 * GET /api/opposing/teams?teamId=<uuid>
 * List opposing programs scouted by the given user team.
 */
router.get('/teams', authenticateToken, asyncHandler(async (req, res) => {
  const { teamId } = req.query;
  if (!teamId) throw new AppError('teamId query param required', 400);
  await requireTeamAccess(req.coachId, teamId);

  const result = await query(
    `SELECT id, team_id, name, notes, created_at, updated_at
       FROM opposing_teams
      WHERE team_id = $1
      ORDER BY name`,
    [teamId]
  );
  res.json({ success: true, opposingTeams: result.rows });
}));

/**
 * POST /api/opposing/teams
 * Create a scouting entry for an opposing program.
 * Body: { teamId, name, notes? }
 */
router.post('/teams', authenticateToken, asyncHandler(async (req, res) => {
  const parsed = opposingTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
  }
  const { teamId, name, notes } = parsed.data;
  await requireTeamAccess(req.coachId, teamId);

  const result = await query(
    `INSERT INTO opposing_teams (team_id, name, notes)
     VALUES ($1, $2, $3)
     RETURNING id, team_id, name, notes, created_at, updated_at`,
    [teamId, name, notes || null]
  );
  res.status(201).json({ success: true, opposingTeam: result.rows[0] });
}));

/**
 * PATCH /api/opposing/teams/:id
 */
router.patch('/teams/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await requireOpposingTeamAccess(req.coachId, id);

  const parsed = opposingTeamUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
  }
  const { name, notes } = parsed.data;

  const result = await query(
    `UPDATE opposing_teams
        SET name  = COALESCE($2, name),
            notes = COALESCE($3, notes)
      WHERE id = $1
      RETURNING id, team_id, name, notes, created_at, updated_at`,
    [id, name ?? null, notes ?? null]
  );
  res.json({ success: true, opposingTeam: result.rows[0] });
}));

/**
 * DELETE /api/opposing/teams/:id
 */
router.delete('/teams/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await requireOpposingTeamAccess(req.coachId, id);

  await query('DELETE FROM opposing_teams WHERE id = $1', [id]);
  res.json({ success: true });
}));

// ─── Opposing players ────────────────────────────────────────────────────────

/**
 * GET /api/opposing/players?opposingTeamId=<uuid>
 */
router.get('/players', authenticateToken, asyncHandler(async (req, res) => {
  const { opposingTeamId } = req.query;
  if (!opposingTeamId) throw new AppError('opposingTeamId query param required', 400);
  await requireOpposingTeamAccess(req.coachId, opposingTeamId);

  const result = await query(
    `SELECT id, opposing_team_id, jersey_number, display_name,
            primary_position, notes, created_at, updated_at
       FROM opposing_players
      WHERE opposing_team_id = $1
      ORDER BY jersey_number NULLS LAST, display_name`,
    [opposingTeamId]
  );
  res.json({ success: true, opposingPlayers: result.rows });
}));

/**
 * POST /api/opposing/players
 * Body: { opposingTeamId, jerseyNumber?, displayName?, primaryPosition?, notes? }
 */
router.post('/players', authenticateToken, asyncHandler(async (req, res) => {
  const parsed = opposingPlayerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
  }
  const { opposingTeamId, jerseyNumber, displayName, primaryPosition, notes } = parsed.data;
  await requireOpposingTeamAccess(req.coachId, opposingTeamId);

  const result = await query(
    `INSERT INTO opposing_players
       (opposing_team_id, jersey_number, display_name, primary_position, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, opposing_team_id, jersey_number, display_name,
               primary_position, notes, created_at, updated_at`,
    [
      opposingTeamId,
      jerseyNumber ?? null,
      displayName ?? null,
      primaryPosition ?? null,
      notes ?? null,
    ]
  );
  res.status(201).json({ success: true, opposingPlayer: result.rows[0] });
}));

/**
 * PATCH /api/opposing/players/:id
 */
router.patch('/players/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Verify access via the parent opposing_team
  const existing = await query(
    `SELECT op.id, ot.team_id
       FROM opposing_players op
       JOIN opposing_teams ot ON op.opposing_team_id = ot.id
       JOIN teams t            ON ot.team_id        = t.id
      WHERE op.id = $1 AND t.coach_id = $2`,
    [id, req.coachId]
  );
  if (existing.rows.length === 0) {
    throw new AppError('Opposing player not found or access denied.', 403);
  }

  const parsed = opposingPlayerUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
  }
  const updates = parsed.data;

  const fields = [];
  const values = [id];
  let n = 2;
  for (const [key, col] of [
    ['jerseyNumber', 'jersey_number'],
    ['displayName', 'display_name'],
    ['primaryPosition', 'primary_position'],
    ['notes', 'notes'],
  ]) {
    if (updates[key] !== undefined) {
      fields.push(`${col} = $${n++}`);
      values.push(updates[key]);
    }
  }
  if (fields.length === 0) {
    return res.json({ success: true, opposingPlayer: null, message: 'No changes' });
  }

  const result = await query(
    `UPDATE opposing_players
        SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING id, opposing_team_id, jersey_number, display_name,
                primary_position, notes, created_at, updated_at`,
    values
  );
  res.json({ success: true, opposingPlayer: result.rows[0] });
}));

/**
 * DELETE /api/opposing/players/:id
 */
router.delete('/players/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const access = await query(
    `SELECT op.id
       FROM opposing_players op
       JOIN opposing_teams ot ON op.opposing_team_id = ot.id
       JOIN teams t            ON ot.team_id        = t.id
      WHERE op.id = $1 AND t.coach_id = $2`,
    [id, req.coachId]
  );
  if (access.rows.length === 0) {
    throw new AppError('Opposing player not found or access denied.', 403);
  }

  await query('DELETE FROM opposing_players WHERE id = $1', [id]);
  res.json({ success: true });
}));

export default router;
