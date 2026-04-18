import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { query, transaction } from '../services/database.js';
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

// ─── Parent-contact helpers ──────────────────────────────────────────────────
//
// parent_contacts is a child table (migration 015). Coaches can attach 1+ contacts
// to an athlete. We validate/normalize the inbound array once, and on PATCH we use
// a replace-all strategy (simplest; coaches don't edit these frequently).

/**
 * Normalize an inbound parentContacts array. Accepts camelCase keys from the UI,
 * filters out fully-empty rows, trims strings, and rejects rows with no usable
 * content (name/email/phone all blank). Returns an array of {name, email, phone}.
 */
function normalizeParentContacts(raw) {
  if (raw == null) return null;            // caller chose not to touch contacts
  if (!Array.isArray(raw)) {
    throw new AppError('parentContacts must be an array.', 400);
  }
  const out = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') {
      throw new AppError('Each parent contact must be an object.', 400);
    }
    const name  = (c.name  ?? '').toString().trim() || null;
    const email = (c.email ?? '').toString().trim() || null;
    const phone = (c.phone ?? '').toString().trim() || null;
    if (!name && !email && !phone) continue;    // skip blank rows
    out.push({ name, email, phone });
  }
  return out;
}

/**
 * Return the parent_contacts rows for an athlete, ordered by creation time.
 * Pass a pg client to run inside a transaction, or null to use the pool.
 */
async function fetchContacts(client, athleteId) {
  const sql = `SELECT id, name, email, phone, created_at, updated_at
                 FROM parent_contacts
                WHERE athlete_id = $1
                ORDER BY created_at ASC, id ASC`;
  const res = client ? await client.query(sql, [athleteId]) : await query(sql, [athleteId]);
  return res.rows;
}

/**
 * Replace all parent_contacts rows for an athlete with the supplied list.
 * Must run inside a transaction (pass the pg client).
 */
async function replaceContacts(client, athleteId, contacts) {
  await client.query('DELETE FROM parent_contacts WHERE athlete_id = $1', [athleteId]);
  for (const c of contacts) {
    await client.query(
      `INSERT INTO parent_contacts (athlete_id, name, email, phone)
       VALUES ($1, $2, $3, $4)`,
      [athleteId, c.name, c.email, c.phone]
    );
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
       a.graduation_year, a.graduation_month, a.status, a.notes,
       a.shot_hand, a.is_captain, a.depth_tier,
       a.skill_ground_balls, a.skill_dodging, a.skill_shooting,
       a.skill_passing, a.skill_defense, a.skill_faceoff,
       a.skill_transition, a.skill_field_awareness,
       -- Season stats from view (if available)
       COALESCE(aps.goals, 0)          AS goals,
       COALESCE(aps.assists, 0)        AS assists,
       COALESCE(aps.shots, 0)          AS shots,
       COALESCE(aps.ground_balls, 0)   AS ground_balls,
       COALESCE(aps.saves, 0)          AS saves,
       COALESCE(aps.faceoff_wins, 0)   AS faceoff_wins,
       COALESCE(aps.faceoff_losses, 0) AS faceoff_losses,
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
       COALESCE(aps.saves, 0)          AS saves,
       COALESCE(aps.faceoff_wins, 0)   AS faceoff_wins,
       COALESCE(aps.faceoff_losses, 0) AS faceoff_losses,
       COALESCE(aps.games_participated, 0) AS games_played
     FROM athletes a
     LEFT JOIN athlete_season_stats aps ON a.id = aps.athlete_id
     WHERE a.id = $1`,
    [req.params.id]
  );

  if (result.rows.length === 0) throw new AppError('Athlete not found', 404);

  const athlete = result.rows[0];
  await requireTeamAccess(req.coachId, athlete.team_id);

  athlete.parent_contacts = await fetchContacts(null, athlete.id);

  res.json({ success: true, athlete });
}));

// ─── POST / — add athlete ─────────────────────────────────────────────────────

router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const {
    teamId, firstName, lastName, jerseyNumber,
    primaryPosition, secondaryPosition, graduationYear, graduationMonth, notes,
    email, sendGameSummary,
    shotHand, isCaptain, depthTier,
    skillGroundBalls, skillDodging, skillShooting, skillPassing,
    skillDefense, skillFaceoff, skillTransition, skillFieldAwareness,
    parentContacts,
  } = req.body;

  if (!teamId || !firstName || !lastName) {
    throw new AppError('teamId, firstName, and lastName are required.', 400);
  }
  if (graduationMonth != null && (!Number.isInteger(graduationMonth) || graduationMonth < 1 || graduationMonth > 12)) {
    throw new AppError('graduationMonth must be an integer between 1 and 12.', 400);
  }
  if (shotHand != null && !['right','left','both'].includes(shotHand)) {
    throw new AppError("shotHand must be 'right', 'left', or 'both'.", 400);
  }
  if (depthTier != null && !['starter','rotation','developmental'].includes(depthTier)) {
    throw new AppError("depthTier must be 'starter', 'rotation', or 'developmental'.", 400);
  }

  const contactsToInsert = normalizeParentContacts(parentContacts); // null if not supplied

  await requireTeamAccess(req.coachId, teamId);

  const athlete = await transaction(async (client) => {
    const ins = await client.query(
      `INSERT INTO athletes (
         team_id, first_name, last_name, jersey_number,
         primary_position, secondary_position, graduation_year, graduation_month, notes,
         email, send_game_summary,
         shot_hand, is_captain, depth_tier,
         skill_ground_balls, skill_dodging, skill_shooting, skill_passing,
         skill_defense, skill_faceoff, skill_transition, skill_field_awareness
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        teamId, firstName, lastName, jerseyNumber || null,
        primaryPosition || null, secondaryPosition || null,
        graduationYear || null, graduationMonth ?? null, notes || null,
        email || null, sendGameSummary ? true : false,
        shotHand || null, isCaptain ? true : false, depthTier || null,
        skillGroundBalls || null, skillDodging || null,
        skillShooting || null, skillPassing || null,
        skillDefense || null, skillFaceoff || null,
        skillTransition || null, skillFieldAwareness || null,
      ]
    );
    const row = ins.rows[0];
    if (contactsToInsert && contactsToInsert.length > 0) {
      await replaceContacts(client, row.id, contactsToInsert);
    }
    row.parent_contacts = await fetchContacts(client, row.id);
    return row;
  });

  logger.info(`Athlete added: ${firstName} ${lastName} to team ${teamId}`);
  res.status(201).json({ success: true, athlete });
}));

// ─── PATCH /:id — update athlete ──────────────────────────────────────────────

router.patch('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const athleteResult = await query('SELECT * FROM athletes WHERE id = $1', [req.params.id]);
  if (athleteResult.rows.length === 0) throw new AppError('Athlete not found', 404);

  const existing = athleteResult.rows[0];
  await requireTeamAccess(req.coachId, existing.team_id);

  // Pull parentContacts out of the body up front so the column-mapping loop
  // doesn't try to treat it as an athletes column. null = caller didn't touch
  // contacts; [] = caller wants to clear them.
  const { parentContacts, ...fieldBody } = req.body;
  const contactsToReplace = normalizeParentContacts(parentContacts);

  const fields  = [];
  const values  = [];
  let   idx     = 1;

  const allowed = [
    'first_name', 'last_name', 'jersey_number', 'primary_position',
    'secondary_position', 'graduation_year', 'graduation_month', 'status', 'notes',
    'email', 'send_game_summary',
    'shot_hand', 'is_captain', 'depth_tier',
    'skill_ground_balls', 'skill_dodging', 'skill_shooting', 'skill_passing',
    'skill_defense', 'skill_faceoff', 'skill_transition', 'skill_field_awareness',
  ];

  // Map camelCase body keys to snake_case columns
  const keyMap = {
    firstName: 'first_name', lastName: 'last_name', jerseyNumber: 'jersey_number',
    primaryPosition: 'primary_position', secondaryPosition: 'secondary_position',
    graduationYear: 'graduation_year', graduationMonth: 'graduation_month',
    sendGameSummary: 'send_game_summary',
    shotHand: 'shot_hand', isCaptain: 'is_captain', depthTier: 'depth_tier',
    skillGroundBalls: 'skill_ground_balls',
    skillDodging: 'skill_dodging', skillShooting: 'skill_shooting',
    skillPassing: 'skill_passing', skillDefense: 'skill_defense',
    skillFaceoff: 'skill_faceoff', skillTransition: 'skill_transition',
    skillFieldAwareness: 'skill_field_awareness',
  };

  for (const [key, val] of Object.entries(fieldBody)) {
    const col = keyMap[key] || key;
    if (allowed.includes(col)) {
      if (col === 'graduation_month' && val != null &&
          (!Number.isInteger(val) || val < 1 || val > 12)) {
        throw new AppError('graduationMonth must be an integer between 1 and 12.', 400);
      }
      if (col === 'shot_hand' && val != null && !['right','left','both'].includes(val)) {
        throw new AppError("shotHand must be 'right', 'left', or 'both'.", 400);
      }
      if (col === 'depth_tier' && val != null && !['starter','rotation','developmental'].includes(val)) {
        throw new AppError("depthTier must be 'starter', 'rotation', or 'developmental'.", 400);
      }
      fields.push(`${col} = $${idx++}`);
      values.push(col === 'is_captain' ? !!val : val);
    }
  }

  // The request must do SOMETHING — either change a column or touch contacts.
  if (fields.length === 0 && contactsToReplace === null) {
    throw new AppError('No valid fields to update.', 400);
  }

  const athlete = await transaction(async (client) => {
    let row = existing;
    if (fields.length > 0) {
      values.push(req.params.id);
      const updated = await client.query(
        `UPDATE athletes SET ${fields.join(', ')}, updated_at = NOW()
         WHERE id = $${idx} RETURNING *`,
        values
      );
      row = updated.rows[0];
    }
    if (contactsToReplace !== null) {
      await replaceContacts(client, req.params.id, contactsToReplace);
    }
    row.parent_contacts = await fetchContacts(client, req.params.id);
    return row;
  });

  res.json({ success: true, athlete });
}));

// ─── GET /:id/season-history — per-season stat aggregates ────────────────────
//
// Returns one row per season in which the athlete logged at least one event,
// most-recent season first. Aggregation mirrors the full-season view so the
// "Previous Season" UI can compare apples to apples.

router.get('/:id/season-history', authenticateToken, asyncHandler(async (req, res) => {
  const athleteResult = await query('SELECT team_id FROM athletes WHERE id = $1', [req.params.id]);
  if (athleteResult.rows.length === 0) throw new AppError('Athlete not found', 404);

  await requireTeamAccess(req.coachId, athleteResult.rows[0].team_id);

  const result = await query(
    `SELECT
       s.id           AS season_id,
       s.name         AS season_name,
       s.start_date,
       s.end_date,
       COUNT(CASE WHEN ge.event_type = 'goal'          THEN 1 END) AS goals,
       COUNT(CASE WHEN ge.event_type = 'assist'        THEN 1 END) AS assists,
       COUNT(CASE WHEN ge.event_type = 'shot'          THEN 1 END) AS shots,
       COUNT(CASE WHEN ge.event_type = 'ground_ball'   THEN 1 END) AS ground_balls,
       COUNT(CASE WHEN ge.event_type = 'save'          THEN 1 END) AS saves,
       COUNT(CASE WHEN ge.event_type = 'faceoff_win'   THEN 1 END) AS faceoff_wins,
       COUNT(CASE WHEN ge.event_type = 'faceoff_loss'  THEN 1 END) AS faceoff_losses,
       COUNT(DISTINCT ge.game_id)                                  AS games_played
     FROM seasons s
     JOIN games g       ON g.season_id = s.id
     JOIN game_events ge ON ge.game_id = g.id AND ge.athlete_id = $1
     GROUP BY s.id, s.name, s.start_date, s.end_date
     ORDER BY s.start_date DESC`,
    [req.params.id]
  );

  res.json({ success: true, seasons: result.rows });
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
