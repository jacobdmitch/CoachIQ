import express from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../services/logger.js';
import * as playService from '../services/playService.js';

const router = express.Router();

// Validation schemas
const diagramDataSchema = z.object({
  format: z.enum(['half_field', 'full_field']),
  players: z.array(
    z.object({
      id: z.string(),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      label: z.string(),
      role: z.enum(['Attack', 'Midfield', 'Defense', 'Goalie', 'FOGO']),
      color: z.string(),
      movement: z.array(z.any()).optional(),
    })
  ).optional(),
  arrows: z.array(
    z.object({
      id: z.string(),
      from: z.string(),
      points: z.array(z.array(z.number())),
      type: z.enum(['run', 'pass', 'screen']),
    })
  ).optional(),
  text_labels: z.array(
    z.object({
      id: z.string(),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      text: z.string(),
    })
  ).optional(),
}).optional();

const createPlaySchema = z.object({
  teamId: z.string().uuid(),
  title: z.string().min(1).max(255),
  situationTag: z.enum(['emo', 'man_down', 'settled', 'transition', 'faceoff', 'clear', '6s_set', '6s_fast_break']).optional(),
  diagramData: diagramDataSchema,
  notes: z.string().optional(),
});

const updatePlaySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  situationTag: z.enum(['emo', 'man_down', 'settled', 'transition', 'faceoff', 'clear', '6s_set', '6s_fast_break']).optional(),
  diagramData: diagramDataSchema,
  notes: z.string().optional(),
});

/**
 * GET /api/plays
 * List all plays for the coach's team(s), with optional filtering
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { teamId, situationTag } = req.query;

    const filters = {};
    if (teamId) filters.teamId = teamId;
    if (situationTag) filters.situationTag = situationTag;

    const plays = await playService.listPlays(req.coachId, filters);

    res.json({ success: true, data: plays });
  } catch (err) {
    logger.error('GET /api/plays error:', err);
    res.status(500).json({ success: false, error: 'Failed to list plays' });
  }
});

/**
 * GET /api/plays/:id
 * Get single play with full diagram_data
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const play = await playService.getPlay(req.params.id, req.coachId);

    if (!play) {
      return res.status(404).json({ success: false, error: 'Play not found' });
    }

    res.json({ success: true, data: play });
  } catch (err) {
    logger.error('GET /api/plays/:id error:', err);
    res.status(500).json({ success: false, error: 'Failed to get play' });
  }
});

/**
 * POST /api/plays
 * Create new play
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const parsed = createPlaySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid request body', details: parsed.error.issues });
    }

    const play = await playService.createPlay(req.coachId, parsed.data);
    res.status(201).json({ success: true, data: play });
  } catch (err) {
    logger.error('POST /api/plays error:', err);
    if (err.message.includes('unauthorized')) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    res.status(500).json({ success: false, error: 'Failed to create play' });
  }
});

/**
 * PUT /api/plays/:id
 * Update play (title, situation_tag, diagram_data, notes)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const parsed = updatePlaySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid request body', details: parsed.error.issues });
    }

    const play = await playService.updatePlay(req.params.id, req.coachId, parsed.data);
    res.json({ success: true, data: play });
  } catch (err) {
    logger.error('PUT /api/plays/:id error:', err);
    if (err.message.includes('unauthorized')) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: 'Play not found' });
    }
    res.status(500).json({ success: false, error: 'Failed to update play' });
  }
});

/**
 * DELETE /api/plays/:id
 * Delete play
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await playService.deletePlay(req.params.id, req.coachId);
    res.json({ success: true, message: 'Play deleted successfully' });
  } catch (err) {
    logger.error('DELETE /api/plays/:id error:', err);
    if (err.message.includes('unauthorized')) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: 'Play not found' });
    }
    res.status(500).json({ success: false, error: 'Failed to delete play' });
  }
});

/**
 * POST /api/plays/:id/duplicate
 * Duplicate a play with new title (defaults to "[Original Title] (Copy)")
 */
router.post('/:id/duplicate', authenticateToken, async (req, res) => {
  try {
    const { newTitle } = req.body;
    const play = await playService.duplicatePlay(req.params.id, req.coachId, newTitle);
    res.status(201).json({ success: true, data: play });
  } catch (err) {
    logger.error('POST /api/plays/:id/duplicate error:', err);
    if (err.message.includes('unauthorized')) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: 'Play not found' });
    }
    res.status(500).json({ success: false, error: 'Failed to duplicate play' });
  }
});

/**
 * GET /api/plays/:id/export
 * Export play as PNG data URL (server validates ownership, client does render)
 */
router.get('/:id/export', authenticateToken, async (req, res) => {
  try {
    const play = await playService.getPlay(req.params.id, req.coachId);

    if (!play) {
      return res.status(404).json({ success: false, error: 'Play not found' });
    }

    // Return diagram data and metadata for client-side PNG rendering
    res.json({
      success: true,
      data: {
        play: play,
        exportReady: true,
      },
    });
  } catch (err) {
    logger.error('GET /api/plays/:id/export error:', err);
    res.status(500).json({ success: false, error: 'Failed to export play' });
  }
});

export default router;
