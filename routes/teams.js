import express from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { query as dbQuery } from '../services/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { uploadFile, deleteFile } from '../services/storageService.js';

const createTeamSchema = z.object({
  teamName: z.string().min(1).max(255),
  season: z.string().max(50).optional(),
  sportType: z.enum(['field_lacrosse']).default('field_lacrosse'),
  gameFormat: z.enum(['standard', '6s']).default('standard'),
});

const updateTeamSchema = z.object({
  teamName: z.string().min(1).max(255).optional(),
  season: z.string().max(50).optional(),
  sportType: z.enum(['field_lacrosse']).optional(),
  gameFormat: z.enum(['standard', '6s']).optional(),
  primaryColor: z.string().max(7).regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
});

const router = express.Router();

// ─── All routes require auth ────────────────────────────────────────────────
router.use(authenticateToken);

// ─── Multer — memory storage for logo uploads (buffer passed to storageService) ─

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and SVG files are allowed'));
    }
  },
});

// ─── Helper: verify coach owns the team ─────────────────────────────────────

async function requireTeamOwner(coachId, teamId) {
  const { rows } = await dbQuery(
    'SELECT id FROM teams WHERE id = $1 AND coach_id = $2',
    [teamId, coachId]
  );
  if (rows.length === 0) {
    throw new AppError('Team not found or access denied', 403);
  }
}

// ─── GET /api/teams — list all teams for the authenticated coach ─────────────

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await dbQuery(
    `SELECT id, team_name, season, sport_type, game_format,
            logo_url, primary_color, created_at
       FROM teams
      WHERE coach_id = $1
      ORDER BY created_at DESC`,
    [req.coachId]
  );
  res.json({ success: true, teams: rows });
}));

// ─── GET /api/teams/:id ──────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await dbQuery(
    `SELECT id, team_name, season, sport_type, game_format,
            logo_url, primary_color, created_at
       FROM teams
      WHERE id = $1 AND coach_id = $2`,
    [req.params.id, req.coachId]
  );
  if (rows.length === 0) throw new AppError('Team not found', 404);
  res.json({ success: true, team: rows[0] });
}));

// ─── POST /api/teams — create a new team ────────────────────────────────────

router.post('/', asyncHandler(async (req, res) => {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
  }
  const { teamName, season, sportType, gameFormat } = parsed.data;

  const { rows } = await dbQuery(
    `INSERT INTO teams (coach_id, team_name, season, sport_type, game_format)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, team_name, season, sport_type, game_format, logo_url, primary_color, created_at`,
    [req.coachId, teamName.trim(), season || null, sportType, gameFormat]
  );
  res.status(201).json({ success: true, team: rows[0] });
}));

// ─── PATCH /api/teams/:id — update team details ──────────────────────────────

router.patch('/:id', asyncHandler(async (req, res) => {
  await requireTeamOwner(req.coachId, req.params.id);

  const parsed = updateTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
  }
  const { teamName, season, sportType, gameFormat, primaryColor } = parsed.data;

  const fields = [];
  const values = [];
  let   i = 1;

  if (teamName    !== undefined) { fields.push(`team_name = $${i++}`);    values.push(teamName.trim()); }
  if (season      !== undefined) { fields.push(`season = $${i++}`);       values.push(season); }
  if (sportType   !== undefined) { fields.push(`sport_type = $${i++}`);   values.push(sportType); }
  if (gameFormat  !== undefined) { fields.push(`game_format = $${i++}`);  values.push(gameFormat); }
  if (primaryColor !== undefined) { fields.push(`primary_color = $${i++}`); values.push(primaryColor || null); }

  if (fields.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  values.push(req.params.id);
  const { rows } = await dbQuery(
    `UPDATE teams SET ${fields.join(', ')} WHERE id = $${i}
     RETURNING id, team_name, season, sport_type, game_format, logo_url, primary_color`,
    values
  );
  res.json({ success: true, team: rows[0] });
}));

// ─── POST /api/teams/:teamId/logo — upload or replace team logo ───────────────

router.post('/:teamId/logo', upload.single('logo'), asyncHandler(async (req, res) => {
  await requireTeamOwner(req.coachId, req.params.teamId);

  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  // Remove old logo file if one exists
  const { rows: existing } = await dbQuery(
    'SELECT logo_url FROM teams WHERE id = $1',
    [req.params.teamId]
  );
  if (existing[0]?.logo_url) {
    await deleteFile(existing[0].logo_url);
  }

  const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
  const filename = `team-${req.params.teamId}-${Date.now()}${ext}`;
  const logoUrl = await uploadFile(req.file.buffer, filename, req.file.mimetype);

  const { rows } = await dbQuery(
    `UPDATE teams SET logo_url = $1 WHERE id = $2
     RETURNING id, team_name, logo_url`,
    [logoUrl, req.params.teamId]
  );
  res.json({ success: true, team: rows[0] });
}));

// ─── DELETE /api/teams/:id/logo — remove logo ────────────────────────────────

router.delete('/:id/logo', asyncHandler(async (req, res) => {
  await requireTeamOwner(req.coachId, req.params.id);

  const { rows } = await dbQuery(
    'SELECT logo_url FROM teams WHERE id = $1',
    [req.params.id]
  );
  if (rows[0]?.logo_url) {
    await deleteFile(rows[0].logo_url);
    await dbQuery('UPDATE teams SET logo_url = NULL WHERE id = $1', [req.params.id]);
  }
  res.json({ success: true });
}));

// ─── Multer error handler ────────────────────────────────────────────────────

router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError || err.message?.includes('Only')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
