import express from 'express';
import bcrypt from 'bcrypt';
import { query } from '../services/database.js';
import logger from '../services/logger.js';
import { generateToken, generateRefreshToken, authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCoachTeams(coachId) {
  const result = await query(
    `SELECT id, team_name, season, sport_type, game_format
     FROM teams WHERE coach_id = $1 ORDER BY created_at DESC`,
    [coachId]
  );
  return result.rows;
}

function formatCoach(row) {
  return {
    id:               row.id,
    email:            row.email,
    firstName:        row.first_name,
    lastName:         row.last_name,
    subscriptionTier: row.subscription_tier,
  };
}

// ─── POST /login ──────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await query(
      'SELECT * FROM coaches WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const coach = result.rows[0];
    const validPassword = await bcrypt.compare(password, coach.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token        = generateToken({ coachId: coach.id, email: coach.email, role: 'coach' });
    const refreshToken = generateRefreshToken({ coachId: coach.id, email: coach.email });
    const teams        = await getCoachTeams(coach.id);

    logger.info(`Coach logged in: ${coach.email}`);

    res.json({
      success: true,
      coach:   formatCoach(coach),
      teams,
      token,
      refreshToken,
    });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM coaches WHERE id = $1',
      [req.coachId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Coach not found.' });
    }

    const coach = result.rows[0];
    const teams = await getCoachTeams(coach.id);

    res.json({
      success: true,
      coach:   formatCoach(coach),
      teams,
    });
  } catch (err) {
    logger.error('GET /me error:', err);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// ─── POST /register ───────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  const { email, password, firstName, lastName, teamName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    // Check duplicate
    const existing = await query('SELECT id FROM coaches WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const coachResult  = await query(
      `INSERT INTO coaches (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [email.toLowerCase().trim(), passwordHash, firstName || '', lastName || '']
    );
    const coach = coachResult.rows[0];

    // Create default team
    let teams = [];
    if (teamName) {
      const teamResult = await query(
        `INSERT INTO teams (coach_id, team_name, season)
         VALUES ($1, $2, $3) RETURNING *`,
        [coach.id, teamName, new Date().getFullYear().toString()]
      );
      teams = teamResult.rows;
    }

    const token        = generateToken({ coachId: coach.id, email: coach.email, role: 'coach' });
    const refreshToken = generateRefreshToken({ coachId: coach.id, email: coach.email });

    logger.info(`New coach registered: ${coach.email}`);

    res.status(201).json({
      success: true,
      coach:   formatCoach(coach),
      teams,
      token,
      refreshToken,
    });
  } catch (err) {
    logger.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

export default router;
