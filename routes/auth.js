import express from 'express';
import bcrypt from 'bcrypt';
import { query } from '../services/database.js';
import logger from '../services/logger.js';
import { generateToken, generateRefreshToken, verifyRefreshToken, authenticateToken } from '../middleware/auth.js';

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

// ─── POST /refresh ───────────────────────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required.' });
  }

  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }

  try {
    // Confirm the coach still exists before issuing a new token
    const result = await query(
      'SELECT id, email FROM coaches WHERE id = $1',
      [decoded.coachId]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Coach no longer exists.' });
    }

    const coach = result.rows[0];
    const token = generateToken({ coachId: coach.id, email: coach.email, role: 'coach' });

    res.json({ success: true, token });
  } catch (err) {
    logger.error('POST /refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh token.' });
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

// ─── PATCH /profile — update coach name ──────────────────────────────────────

router.patch('/profile', authenticateToken, async (req, res) => {
  const { firstName, lastName } = req.body;
  if (!firstName && !lastName) {
    return res.status(400).json({ error: 'At least one of firstName or lastName is required.' });
  }

  try {
    const fields = [];
    const values = [];
    let   idx    = 1;

    if (firstName !== undefined) { fields.push(`first_name = $${idx++}`); values.push(firstName); }
    if (lastName  !== undefined) { fields.push(`last_name  = $${idx++}`); values.push(lastName); }

    values.push(req.coachId);
    const result = await query(
      `UPDATE coaches SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} RETURNING id, email, first_name, last_name, subscription_tier`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Coach not found.' });
    }

    res.json({ success: true, coach: formatCoach(result.rows[0]) });
  } catch (err) {
    logger.error('PATCH /profile error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ─── POST /change-password ────────────────────────────────────────────────────

router.post('/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  try {
    const result = await query('SELECT * FROM coaches WHERE id = $1', [req.coachId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Coach not found.' });
    }

    const coach = result.rows[0];
    const valid = await bcrypt.compare(currentPassword, coach.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await query(
      'UPDATE coaches SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, req.coachId]
    );

    logger.info(`Password changed for coach: ${coach.email}`);
    res.json({ success: true });
  } catch (err) {
    logger.error('POST /change-password error:', err);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

export default router;
