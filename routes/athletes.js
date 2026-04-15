import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { query } from '../services/database.js';
import logger from '../services/logger.js';

const router = express.Router();

// Helper: verify team belongs to requesting coach
async function requireTeamAccess(coachId, teamId) {
  const result = await query(
    'SELECT id FROM teams WHERE id = $1 AND coach_id = $2',
    [teamId, coachId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Team not found or access denied.', 403);
  }
}

// ─── GET / — roster for a team ────────────────────────────────────────────────

router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { teamId } = req.query;
  if (!teamId) throw new AppError('teamId query param required', 400);

  await requireTeamAccess(req.coachId, teamId);

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const countResult = await query(
    'SELECT COUNT(*) AS total FROM athletes WHERE team_id = $1',
    [teamId]
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const result = await query(
    `SELECT
       a.id, a.jersey_number, a.first_name, a.last_name,
       a.primary_position, a.secondary_position,
       a.graduation_year, a.status, a.notes,
       a.skill_ground_balls, a.skill_dodging, a.skill_shooting,
       a.skill_passing, a.skill_defense, a.skill_faceoff,
       a.skill_transition, a.skill_field_awareness,
       -- Season stats from view (if available)
       COALESCE(aps.goals, 0)          AS goals,
       COALESCE(aps.assists, 0)        AS assists,
       COALESCE(aps.shots, 0)          AS shots,
       COALESCE(aps.ground_balls, 0)   AS ground_balls,
       COALESCE(aps.games_participated, 0) AS games_played
     FROM athletes a
     LEFT JOIN athlete_season_stats aps ON a.id = aps.athlete_id
     WHERE a.team_id = $1
     ORDER BY a.primary_position, a.last_name
     LIMIT $2 OFFSET $3`,
    [teamId, limit, offset]
  );

  res.json({ success: true, athletes: result.rows, pagination: { total, limit, offset, hasMore: offset + limit < total } });
}));

// ─── GET /:id — single athlete ────────────────────────────────────────────────

router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT a.*,
       COALESCE(aps.goals, 0)          AS goals,
       COALESCE(aps.assists, 0)        AS assists,
       COALESCE(aps.shots, 0)          AS shots,
       COALESCE(aps.ground_balls, 0)   AS ground_balls,
       COALESCE(aps.games_participated, 0) AS games_played
     FROM athletes a
     LEFT JOIN athlete_season_stats aps ON a.id = aps.athlete_id
     WHERE a.id = $1`,
    [req.params.id]
  );

  if (result.rows.length === 0) throw new AppError('Athlete not found', 404);

  const athlete = result.rows[0];
  await requireTeamAccess(req.coachId, athlete.team_id);

  res.json({ success: true, athlete });
}));

// ─── POST / — add athlete ─────────────────────────────────────────────────────

router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const {
    teamId, firstName, lastName, jerseyNumber,
    primaryPosition, secondaryPosition, graduationYear, notes,
    email, sendGameSummary,
    skillGroundBalls, skillDodging, skillShooting, skillPassing,
    skillDefense, skillFaceoff, skillTransition, skillFieldAwareness,
  } = req.body;

  if (!teamId || !firstName || !lastName) {
    throw new AppError('teamId, firstName, and lastName are required.', 400);
  }

  await requireTeamAccess(req.coachId, teamId);

  const result = await query(
    `INSERT INTO athletes (
       team_id, first_name, last_name, jersey_number,
       primary_position, secondary_position, graduation_year, notes,
       email, send_game_summary,
       skill_ground_balls, skill_dodging, skill_shooting, skill_passing,
       skill_defense, skill_faceoff, skill_transition, skill_field_awareness
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [
      teamId, firstName, lastName, jerseyNumber || null,
      primaryPosition || null, secondaryPosition || null,
      graduationYear || null, notes || null,
      email || null, sendGameSummary ? true : false,
      skillGroundBalls || null, skillDodging || null,
      skillShooting || null, skillPassing || null,
      skillDefense || null, skillFaceoff || null,
      skillTransition || null, skillFieldAwareness || null,
    ]
  );

  logger.info(`Athlete added: ${firstName} ${lastName} to team ${teamId}`);
  res.status(201).json({ success: true, athlete: result.rows[0] });
}));

// ─── PATCH /:id — update athlete ──────────────────────────────────────────────

router.patch('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const athleteResult = await query('SELECT * FROM athletes WHERE id = $1', [req.params.id]);
  if (athleteResult.rows.length === 0) throw new AppError('Athlete not found', 404);

  const athlete = athleteResult.rows[0];
  await requireTeamAccess(req.coachId, athlete.team_id);

  const fields  = [];
  const values  = [];
  let   idx     = 1;

  const allowed = [
    'first_name', 'last_name', 'jersey_number', 'primary_position',
    'secondary_position', 'graduation_year', 'status', 'notes',
    'email', 'send_game_summary',
    'skill_ground_balls', 'skill_dodging', 'skill_shooting', 'skill_passing',
    'skill_defense', 'skill_faceoff', 'skill_transition', 'skill_field_awareness',
  ];

  // Map camelCase body keys to snake_case columns
  const keyMap = {
    firstName: 'first_name', lastName: 'last_name', jerseyNumber: 'jersey_number',
    primaryPosition: 'primary_position', secondaryPosition: 'secondary_position',
    graduationYear: 'graduation_year', sendGameSummary: 'send_game_summary',
    skillGroundBalls: 'skill_ground_balls',
    skillDodging: 'skill_dodging', skillShooting: 'skill_shooting',
    skillPassing: 'skill_passing', skillDefense: 'skill_defense',
    skillFaceoff: 'skill_faceoff', skillTransition: 'skill_transition',
    skillFieldAwareness: 'skill_field_awareness',
  };

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
    `UPDATE athletes SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${idx} RETURNING *`,
    values
  );

  res.json({ success: true, athlete: updated.rows[0] });
}));

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const athleteResult = await query('SELECT * FROM athletes WHERE id = $1', [req.params.id]);
  if (athleteResult.rows.length === 0) throw new AppError('Athlete not found', 404);

  const athlete = athleteResult.rows[0];
  await requireTeamAccess(req.coachId, athlete.team_id);

  await query('DELETE FROM athletes WHERE id = $1', [req.params.id]);
  logger.info(`Athlete deleted: ${req.params.id}`);

  res.json({ success: true });
}));

export default router;
