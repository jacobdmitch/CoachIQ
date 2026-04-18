import express from 'express';
import { z } from 'zod';
import { query as dbQuery } from '../services/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = express.Router();
router.use(authenticateToken);

// ─── Schemas ────────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const createSeasonSchema = z.object({
  teamId:    z.string().uuid(),
  name:      z.string().min(1).max(100),
  startDate: isoDate,
  endDate:   isoDate,
}).refine((d) => d.endDate >= d.startDate, {
  message: 'endDate must be on or after startDate',
  path: ['endDate'],
});

const updateSeasonSchema = z.object({
  name:      z.string().min(1).max(100).optional(),
  startDate: isoDate.optional(),
  endDate:   isoDate.optional(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function requireTeamOwner(coachId, teamId) {
  const { rows } = await dbQuery(
    'SELECT id FROM teams WHERE id = $1 AND coach_id = $2',
    [teamId, coachId]
  );
  if (rows.length === 0) {
    throw new AppError('Team not found or access denied', 403);
  }
}

async function requireSeasonOwner(coachId, seasonId) {
  const { rows } = await dbQuery(
    `SELECT s.id, s.team_id, s.name, s.start_date, s.end_date
       FROM seasons s
       JOIN teams   t ON t.id = s.team_id
      WHERE s.id = $1 AND t.coach_id = $2`,
    [seasonId, coachId]
  );
  if (rows.length === 0) {
    throw new AppError('Season not found or access denied', 404);
  }
  return rows[0];
}

// Postgres exclusion-constraint violation from the seasons gist index.
function isOverlapError(err) {
  return err?.code === '23P01';
}

// ─── GET /api/seasons?teamId=...&withGamesOnly=true ─────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const teamId = req.query.teamId;
  if (!teamId) throw new AppError('teamId is required', 400);
  await requireTeamOwner(req.coachId, teamId);

  const withGamesOnly = req.query.withGamesOnly === 'true';

  const { rows } = await dbQuery(
    `SELECT s.id, s.team_id, s.name, s.start_date, s.end_date, s.created_at,
            COUNT(g.id)::int                                        AS game_count,
            COUNT(g.id) FILTER (WHERE g.status = 'completed')::int  AS completed_game_count
       FROM seasons s
  LEFT JOIN games   g ON g.season_id = s.id
      WHERE s.team_id = $1
   GROUP BY s.id
     HAVING $2::boolean = false OR COUNT(g.id) > 0
   ORDER BY s.start_date DESC`,
    [teamId, withGamesOnly]
  );

  res.json({ success: true, seasons: rows });
}));

// ─── GET /api/seasons/:id ────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const season = await requireSeasonOwner(req.coachId, req.params.id);
  res.json({ success: true, season });
}));

// ─── POST /api/seasons ───────────────────────────────────────────────────────

router.post('/', asyncHandler(async (req, res) => {
  const parsed = createSeasonSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
  }
  const { teamId, name, startDate, endDate } = parsed.data;
  await requireTeamOwner(req.coachId, teamId);

  try {
    const { rows } = await dbQuery(
      `INSERT INTO seasons (team_id, name, start_date, end_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id, team_id, name, start_date, end_date, created_at`,
      [teamId, name.trim(), startDate, endDate]
    );
    res.status(201).json({ success: true, season: rows[0] });
  } catch (err) {
    if (isOverlapError(err)) {
      throw new AppError('Season dates overlap an existing season for this team', 409);
    }
    throw err;
  }
}));

// ─── PATCH /api/seasons/:id ──────────────────────────────────────────────────

router.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await requireSeasonOwner(req.coachId, req.params.id);

  const parsed = updateSeasonSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
  }
  const { name, startDate, endDate } = parsed.data;

  const nextStart = startDate ?? existing.start_date;
  const nextEnd   = endDate   ?? existing.end_date;
  if (new Date(nextEnd) < new Date(nextStart)) {
    throw new AppError('endDate must be on or after startDate', 400);
  }

  const fields = [];
  const values = [];
  let   i = 1;
  if (name      !== undefined) { fields.push(`name = $${i++}`);       values.push(name.trim()); }
  if (startDate !== undefined) { fields.push(`start_date = $${i++}`); values.push(startDate); }
  if (endDate   !== undefined) { fields.push(`end_date = $${i++}`);   values.push(endDate); }
  fields.push(`updated_at = NOW()`);

  if (fields.length === 1) {
    throw new AppError('No fields to update', 400);
  }

  values.push(req.params.id);
  try {
    const { rows } = await dbQuery(
      `UPDATE seasons SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, team_id, name, start_date, end_date, created_at`,
      values
    );
    res.json({ success: true, season: rows[0] });
  } catch (err) {
    if (isOverlapError(err)) {
      throw new AppError('Season dates overlap an existing season for this team', 409);
    }
    throw err;
  }
}));

// ─── DELETE /api/seasons/:id ─────────────────────────────────────────────────
// Rule: block if any attached game has been played (status active|completed).
// If only scheduled/cancelled games are attached, cascade-delete them along
// with the season so the coach can reset.

router.delete('/:id', asyncHandler(async (req, res) => {
  await requireSeasonOwner(req.coachId, req.params.id);

  const { rows: played } = await dbQuery(
    `SELECT COUNT(*)::int AS count
       FROM games
      WHERE season_id = $1
        AND status IN ('active', 'completed')`,
    [req.params.id]
  );
  if (played[0].count > 0) {
    throw new AppError(
      'Cannot delete a season with played games. Delete or reassign those games first.',
      409
    );
  }

  // Drop remaining scheduled/cancelled games so the season FK can be released.
  await dbQuery('DELETE FROM games WHERE season_id = $1', [req.params.id]);
  await dbQuery('DELETE FROM seasons WHERE id = $1',      [req.params.id]);

  res.json({ success: true });
}));

export default router;
