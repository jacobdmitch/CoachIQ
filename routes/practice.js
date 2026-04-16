import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  listSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  getDrillLibrary,
  getDrillById,
  getPracticeGapAnalysis,
} from '../services/practiceService.js';
import logger from '../services/logger.js';

const router = express.Router();

// Middleware: All practice routes require authentication
router.use(authenticateToken);

// ============================================================================
// DRILL LIBRARY ENDPOINTS — must be registered before /:id to avoid conflict
// ============================================================================

/**
 * GET /api/practice/drills/library
 * Return all drills from the knowledge base JSON (cached in memory)
 */
router.get('/drills/library', async (req, res) => {
  try {
    const drills = await getDrillLibrary();
    res.json({ drills });
  } catch (err) {
    logger.error('Error retrieving drill library:', err);
    res.status(500).json({ error: 'Failed to retrieve drill library' });
  }
});

/**
 * GET /api/practice/drills/:drill_id
 * Get single drill detail from the cached library
 */
router.get('/drills/:drill_id', async (req, res) => {
  try {
    const { drill_id } = req.params;
    const drill = await getDrillById(drill_id);

    if (!drill) {
      return res.status(404).json({ error: 'Drill not found' });
    }

    res.json(drill);
  } catch (err) {
    logger.error('Error retrieving drill:', err);
    res.status(500).json({ error: 'Failed to retrieve drill' });
  }
});

// ============================================================================
// PRACTICE ANALYSIS ENDPOINT — must be registered before /:id to avoid conflict
// ============================================================================

/**
 * GET /api/practice/analysis/:teamId
 * Deterministic practice gap analysis (no Claude call)
 * Returns: { stalledSkills: [...], recommendations: [...] }
 */
router.get('/analysis/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const coachId = req.coachId;

    const analysis = await getPracticeGapAnalysis(teamId, coachId);
    res.json(analysis);
  } catch (err) {
    logger.error('Error analyzing practice gap:', err);
    res.status(500).json({ error: 'Failed to analyze practice gap' });
  }
});

// ============================================================================
// PRACTICE SESSIONS ENDPOINTS
// ============================================================================

/**
 * GET /api/practice
 * List practice sessions for a team with pagination
 * Query params: ?team_id=<uuid>&limit=<number>&offset=<number>
 */
router.get('/', async (req, res) => {
  try {
    const { team_id, limit = 20, offset = 0 } = req.query;
    const coachId = req.coachId;

    if (!team_id) {
      return res.status(400).json({ error: 'team_id query parameter required' });
    }

    const sessions = await listSessions(coachId, team_id, {
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json(sessions);
  } catch (err) {
    logger.error('Error listing practice sessions:', err);
    res.status(500).json({ error: 'Failed to list practice sessions' });
  }
});

/**
 * GET /api/practice/:id
 * Get a single practice session with full drill_blocks
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const coachId = req.coachId;

    const session = await getSession(id, coachId);
    if (!session) {
      return res.status(404).json({ error: 'Practice session not found' });
    }

    res.json(session);
  } catch (err) {
    logger.error('Error retrieving practice session:', err);
    res.status(500).json({ error: 'Failed to retrieve practice session' });
  }
});

/**
 * POST /api/practice
 * Create a new practice session
 * Body: { team_id, practice_date, drill_blocks, focus_tags, notes }
 */
router.post('/', async (req, res) => {
  try {
    const { team_id, practice_date, start_time, drill_blocks, focus_tags, notes } = req.body;
    const coachId = req.coachId;

    if (!team_id || !practice_date || !drill_blocks) {
      return res.status(400).json({
        error: 'team_id, practice_date, and drill_blocks are required',
      });
    }

    const session = await createSession(coachId, {
      team_id,
      practice_date,
      start_time: start_time || null,
      drill_blocks,
      focus_tags: focus_tags || [],
      notes: notes || '',
    });

    res.status(201).json(session);
  } catch (err) {
    logger.error('Error creating practice session:', err);
    res.status(500).json({ error: 'Failed to create practice session' });
  }
});

/**
 * PUT /api/practice/:id
 * Update a practice session
 * Body: { practice_date, drill_blocks, focus_tags, notes }
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const coachId = req.coachId;
    const { practice_date, start_time, drill_blocks, focus_tags, notes } = req.body;

    const session = await updateSession(id, coachId, {
      practice_date,
      start_time,
      drill_blocks,
      focus_tags,
      notes,
    });

    if (!session) {
      return res.status(404).json({ error: 'Practice session not found' });
    }

    res.json(session);
  } catch (err) {
    logger.error('Error updating practice session:', err);
    res.status(500).json({ error: 'Failed to update practice session' });
  }
});

/**
 * DELETE /api/practice/:id
 * Delete a practice session
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const coachId = req.coachId;

    const success = await deleteSession(id, coachId);
    if (!success) {
      return res.status(404).json({ error: 'Practice session not found' });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Error deleting practice session:', err);
    res.status(500).json({ error: 'Failed to delete practice session' });
  }
});

export default router;
