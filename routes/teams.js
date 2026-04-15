import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { pool } from '../services/database.js';
import { authenticateToken } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const router = express.Router();

// ─── All routes require auth ────────────────────────────────────────────────
router.use(authenticateToken);

// ─── Multer — disk storage for logo uploads ─────────────────────────────────

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'logos');

// Ensure upload directory exists
async function ensureUploadDir() {
  try { await fs.mkdir(UPLOAD_DIR, { recursive: true }); } catch {}
}
ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.png';
    const name = `team-${req.params.teamId || 'new'}-${Date.now()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
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
  const { rows } = await pool.query(
    'SELECT id FROM teams WHERE id = $1 AND coach_id = $2',
    [teamId, coachId]
  );
  if (rows.length === 0) {
    const err = new Error('Team not found or access denied');
    err.status = 403;
    throw err;
  }
}

// ─── GET /api/teams — list all teams for the authenticated coach ─────────────

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, team_name, season, sport_type, game_format,
            logo_url, primary_color, created_at
       FROM teams
      WHERE coach_id = $1
      ORDER BY created_at DESC`,
    [req.coach.id]
  );
  res.json({ success: true, teams: rows });
});

// ─── GET /api/teams/:id ──────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, team_name, season, sport_type, game_format,
            logo_url, primary_color, created_at
       FROM teams
      WHERE id = $1 AND coach_id = $2`,
    [req.params.id, req.coach.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Team not found' });
  res.json({ success: true, team: rows[0] });
});

// ─── POST /api/teams — create a new team ────────────────────────────────────

router.post('/', async (req, res) => {
  const { teamName, season, sportType = 'lacrosse', gameFormat = '10v10' } = req.body;
  if (!teamName?.trim()) {
    return res.status(400).json({ error: 'teamName is required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO teams (coach_id, team_name, season, sport_type, game_format)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, team_name, season, sport_type, game_format, logo_url, primary_color, created_at`,
    [req.coach.id, teamName.trim(), season || null, sportType, gameFormat]
  );
  res.status(201).json({ success: true, team: rows[0] });
});

// ─── PATCH /api/teams/:id — update team details ──────────────────────────────

router.patch('/:id', async (req, res) => {
  await requireTeamOwner(req.coach.id, req.params.id);

  const { teamName, season, sportType, gameFormat, primaryColor } = req.body;

  const fields = [];
  const values = [];
  let   i = 1;

  if (teamName    !== undefined) { fields.push(`team_name = $${i++}`);    values.push(teamName.trim()); }
  if (season      !== undefined) { fields.push(`season = $${i++}`);       values.push(season); }
  if (sportType   !== undefined) { fields.push(`sport_type = $${i++}`);   values.push(sportType); }
  if (gameFormat  !== undefined) { fields.push(`game_format = $${i++}`);  values.push(gameFormat); }
  if (primaryColor !== undefined) { fields.push(`primary_color = $${i++}`); values.push(primaryColor || null); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE teams SET ${fields.join(', ')} WHERE id = $${i}
     RETURNING id, team_name, season, sport_type, game_format, logo_url, primary_color`,
    values
  );
  res.json({ success: true, team: rows[0] });
});

// ─── POST /api/teams/:teamId/logo — upload or replace team logo ───────────────

router.post('/:teamId/logo', upload.single('logo'), async (req, res) => {
  await requireTeamOwner(req.coach.id, req.params.teamId);

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Remove old logo file if one exists
  const { rows: existing } = await pool.query(
    'SELECT logo_url FROM teams WHERE id = $1',
    [req.params.teamId]
  );
  if (existing[0]?.logo_url) {
    const oldPath = path.join(__dirname, '..', existing[0].logo_url.replace(/^\//, ''));
    fs.unlink(oldPath).catch(() => {});
  }

  const logoUrl = `/uploads/logos/${req.file.filename}`;

  const { rows } = await pool.query(
    `UPDATE teams SET logo_url = $1 WHERE id = $2
     RETURNING id, team_name, logo_url`,
    [logoUrl, req.params.teamId]
  );
  res.json({ success: true, team: rows[0] });
});

// ─── DELETE /api/teams/:id/logo — remove logo ────────────────────────────────

router.delete('/:id/logo', async (req, res) => {
  await requireTeamOwner(req.coach.id, req.params.id);

  const { rows } = await pool.query(
    'SELECT logo_url FROM teams WHERE id = $1',
    [req.params.id]
  );
  if (rows[0]?.logo_url) {
    const filePath = path.join(__dirname, '..', rows[0].logo_url.replace(/^\//, ''));
    fs.unlink(filePath).catch(() => {});
    await pool.query('UPDATE teams SET logo_url = NULL WHERE id = $1', [req.params.id]);
  }
  res.json({ success: true });
});

// ─── Multer error handler ────────────────────────────────────────────────────

router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError || err.message?.includes('Only')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
