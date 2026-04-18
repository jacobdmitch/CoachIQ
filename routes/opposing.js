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
 * POST /api/opposing/teams/lookup
 * Find an opposing team by (teamId, name) or create one if it doesn't exist.
 * This is the film-session entry point — the coach types an opponent name and
 * we return whichever scouting roster that name maps to, creating it on first
 * use. Name match is case-insensitive and whitespace-trimmed.
 * Body: { teamId, name }
 */
router.post('/teams/lookup', authenticateToken, asyncHandler(async (req, res) => {
  const parsed = z.object({
    teamId: z.string().uuid(),
    name:   z.string().min(1).max(255),
  }).safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
  }
  const { teamId } = parsed.data;
  const name = parsed.data.name.trim();
  await requireTeamAccess(req.coachId, teamId);

  const existing = await query(
    `SELECT id, team_id, name, notes, created_at, updated_at
       FROM opposing_teams
      WHERE team_id = $1 AND LOWER(name) = LOWER($2)
      LIMIT 1`,
    [teamId, name]
  );
  if (existing.rows.length > 0) {
    return res.json({ success: true, opposingTeam: existing.rows[0], created: false });
  }

  const created = await query(
    `INSERT INTO opposing_teams (team_id, name)
     VALUES ($1, $2)
     RETURNING id, team_id, name, notes, created_at, updated_at`,
    [teamId, name]
  );
  res.status(201).json({ success: true, opposingTeam: created.rows[0], created: true });
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
 * POST /api/opposing/players/bulk
 * Bulk-insert opposing players for fast film-session entry. Accepts an array
 * of { jerseyNumber?, displayName?, primaryPosition?, notes? }. Existing
 * players with the same (opposingTeamId, jersey_number) are left alone —
 * coaches can edit them individually. Returns the full roster after insert.
 * Body: { opposingTeamId, players: [...] }
 */
router.post('/players/bulk', authenticateToken, asyncHandler(async (req, res) => {
  const parsed = z.object({
    opposingTeamId: z.string().uuid(),
    players: z.array(z.object({
      jerseyNumber:    z.number().int().min(0).max(999).nullable().optional(),
      displayName:     z.string().max(120).optional(),
      primaryPosition: z.enum(['Attack', 'Midfield', 'Defense', 'Goalie', 'FOGO']).nullable().optional(),
      notes:           z.string().max(4000).optional(),
    })).min(1).max(50),
  }).safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
  }
  const { opposingTeamId, players } = parsed.data;
  await requireOpposingTeamAccess(req.coachId, opposingTeamId);

  // Pull existing jersey numbers so we don't create duplicates. Coaches can
  // edit an existing row via PATCH if they need to change its display name.
  const existing = await query(
    'SELECT jersey_number FROM opposing_players WHERE opposing_team_id = $1',
    [opposingTeamId]
  );
  const takenJerseys = new Set(
    existing.rows.map(r => r.jersey_number).filter(n => n !== null && n !== undefined)
  );

  const toInsert = players.filter(p =>
    p.jerseyNumber == null || !takenJerseys.has(p.jerseyNumber)
  );

  // Batch insert with a single VALUES clause. Small (<=50) rows, so a single
  // statement is simpler than a loop and avoids round-trip overhead.
  if (toInsert.length > 0) {
    const values = [];
    const placeholders = toInsert.map((p, i) => {
      const o = i * 5;
      values.push(
        opposingTeamId,
        p.jerseyNumber ?? null,
        p.displayName ?? null,
        p.primaryPosition ?? null,
        p.notes ?? null,
      );
      return `($${o+1}, $${o+2}, $${o+3}, $${o+4}, $${o+5})`;
    }).join(', ');

    await query(
      `INSERT INTO opposing_players
         (opposing_team_id, jersey_number, display_name, primary_position, notes)
       VALUES ${placeholders}`,
      values
    );
  }

  const roster = await query(
    `SELECT id, opposing_team_id, jersey_number, display_name,
            primary_position, notes, created_at, updated_at
       FROM opposing_players
      WHERE opposing_team_id = $1
      ORDER BY jersey_number NULLS LAST, display_name`,
    [opposingTeamId]
  );
  res.status(201).json({
    success: true,
    inserted: toInsert.length,
    skipped:  players.length - toInsert.length,
    opposingPlayers: roster.rows,
  });
}));

// ─── Film stats (pre-game scouting) ──────────────────────────────────────────

async function requireOpposingPlayerAccess(coachId, opposingPlayerId) {
  const result = await query(
    `SELECT op.id
       FROM opposing_players op
       JOIN opposing_teams   ot ON op.opposing_team_id = ot.id
       JOIN teams            t  ON ot.team_id          = t.id
      WHERE op.id = $1 AND t.coach_id = $2`,
    [opposingPlayerId, coachId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Opposing player not found or access denied.', 403);
  }
}

const filmStatsSchema = z.object({
  gamesObserved:   z.number().int().min(0).max(500).optional(),
  goals:           z.number().int().min(0).max(500).optional(),
  assists:         z.number().int().min(0).max(500).optional(),
  shots:           z.number().int().min(0).max(500).optional(),
  shotsOnGoal:     z.number().int().min(0).max(500).optional(),
  groundBalls:     z.number().int().min(0).max(500).optional(),
  turnovers:       z.number().int().min(0).max(500).optional(),
  causedTurnovers: z.number().int().min(0).max(500).optional(),
  saves:           z.number().int().min(0).max(500).optional(),
  faceoffWins:     z.number().int().min(0).max(500).optional(),
  faceoffLosses:   z.number().int().min(0).max(500).optional(),
  penalties:       z.number().int().min(0).max(500).optional(),
  notes:           z.string().max(4000).nullable().optional(),
});

/**
 * GET /api/opposing/players/:id/film-stats
 */
router.get('/players/:id/film-stats', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await requireOpposingPlayerAccess(req.coachId, id);
  const result = await query(
    'SELECT * FROM opposing_player_film_stats WHERE opposing_player_id = $1',
    [id]
  );
  res.json({ success: true, filmStats: result.rows[0] || null });
}));

/**
 * PUT /api/opposing/players/:id/film-stats
 * Upsert the film-session totals for one opposing player. Any field omitted
 * keeps its current value on update; defaults to 0 on insert.
 */
router.put('/players/:id/film-stats', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await requireOpposingPlayerAccess(req.coachId, id);

  const parsed = filmStatsSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
  }
  const d = parsed.data;

  const result = await query(
    `INSERT INTO opposing_player_film_stats (
       opposing_player_id, games_observed, goals, assists, shots, shots_on_goal,
       ground_balls, turnovers, caused_turnovers, saves,
       faceoff_wins, faceoff_losses, penalties, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (opposing_player_id) DO UPDATE SET
       games_observed   = COALESCE(EXCLUDED.games_observed,   opposing_player_film_stats.games_observed),
       goals            = COALESCE(EXCLUDED.goals,            opposing_player_film_stats.goals),
       assists          = COALESCE(EXCLUDED.assists,          opposing_player_film_stats.assists),
       shots            = COALESCE(EXCLUDED.shots,            opposing_player_film_stats.shots),
       shots_on_goal    = COALESCE(EXCLUDED.shots_on_goal,    opposing_player_film_stats.shots_on_goal),
       ground_balls     = COALESCE(EXCLUDED.ground_balls,     opposing_player_film_stats.ground_balls),
       turnovers        = COALESCE(EXCLUDED.turnovers,        opposing_player_film_stats.turnovers),
       caused_turnovers = COALESCE(EXCLUDED.caused_turnovers, opposing_player_film_stats.caused_turnovers),
       saves            = COALESCE(EXCLUDED.saves,            opposing_player_film_stats.saves),
       faceoff_wins     = COALESCE(EXCLUDED.faceoff_wins,     opposing_player_film_stats.faceoff_wins),
       faceoff_losses   = COALESCE(EXCLUDED.faceoff_losses,   opposing_player_film_stats.faceoff_losses),
       penalties        = COALESCE(EXCLUDED.penalties,        opposing_player_film_stats.penalties),
       notes            = COALESCE(EXCLUDED.notes,            opposing_player_film_stats.notes)
     RETURNING *`,
    [
      id,
      d.gamesObserved   ?? 0,
      d.goals           ?? 0,
      d.assists         ?? 0,
      d.shots           ?? 0,
      d.shotsOnGoal     ?? 0,
      d.groundBalls     ?? 0,
      d.turnovers       ?? 0,
      d.causedTurnovers ?? 0,
      d.saves           ?? 0,
      d.faceoffWins     ?? 0,
      d.faceoffLosses   ?? 0,
      d.penalties       ?? 0,
      d.notes           ?? null,
    ]
  );
  res.json({ success: true, filmStats: result.rows[0] });
}));

/**
 * GET /api/opposing/teams/:id/film-stats
 * Return film stats for every player on the roster in a single call. Used to
 * hydrate the scouting tab without making one request per player.
 */
router.get('/teams/:id/film-stats', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await requireOpposingTeamAccess(req.coachId, id);
  const result = await query(
    `SELECT f.*
       FROM opposing_player_film_stats f
       JOIN opposing_players op ON op.id = f.opposing_player_id
      WHERE op.opposing_team_id = $1`,
    [id]
  );
  res.json({ success: true, filmStats: result.rows });
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
