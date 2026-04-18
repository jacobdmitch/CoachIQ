import express from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { query } from '../services/database.js';
import logger from '../services/logger.js';

const router = express.Router();

const joinSchema = z.object({
  joinCode: z.string().length(6),
  // Role the joining coach wants to claim. Head coach role can never be
  // self-granted — it's bound to the coach who started the game.
  role: z.enum(['assistant', 'stat_tracker']).optional(),
});

/**
 * POST /api/game-sessions/join
 * Join an active game session as assistant or stat_tracker.
 * Body: { joinCode, role? }
 *
 * On success: inserts a session_participants row (idempotent on
 * UNIQUE(session_id, coach_id) — re-joining just returns the existing row).
 */
router.post(
  '/join',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(`Invalid input: ${parsed.error.issues.map(i => i.message).join(', ')}`, 400);
    }
    const { joinCode, role = 'assistant' } = parsed.data;

    // Find the active session for this code
    const sessionRes = await query(
      `SELECT gs.id, gs.game_id, gs.head_coach_id, gs.status, g.team_id
         FROM game_sessions gs
         JOIN games g ON g.id = gs.game_id
        WHERE gs.join_code = $1 AND gs.status = 'active'`,
      [joinCode.toUpperCase()]
    );
    if (sessionRes.rows.length === 0) {
      throw new AppError('Invalid or expired join code', 404);
    }
    const session = sessionRes.rows[0];

    // Insert or update the participant row. ON CONFLICT updates the role so a
    // coach who re-joins with a different role gets the new one — the head
    // coach row is protected by the WHERE clause: we don't overwrite head_coach.
    await query(
      `INSERT INTO session_participants (session_id, coach_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id, coach_id)
       DO UPDATE SET role = EXCLUDED.role
       WHERE session_participants.role <> 'head_coach'`,
      [session.id, req.coachId, role]
    );

    logger.info(`Coach ${req.coachId} joined session ${session.id} as ${role}`);

    res.json({
      success: true,
      sessionId: session.id,
      gameId:    session.game_id,
      role,
    });
  })
);

/**
 * GET /api/game-sessions/:gameId/participants
 * List all coaches currently participating in the game session.
 * Used by the "who's connected" sideline badge.
 */
router.get(
  '/:gameId/participants',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;

    const result = await query(
      `SELECT sp.coach_id, sp.role, sp.joined_at,
              c.first_name, c.last_name, c.email
         FROM session_participants sp
         JOIN game_sessions gs ON sp.session_id = gs.id
         JOIN coaches c ON sp.coach_id = c.id
        WHERE gs.game_id = $1 AND gs.status = 'active'
        ORDER BY sp.joined_at ASC`,
      [gameId]
    );

    res.json({ success: true, participants: result.rows });
  })
);

/**
 * POST /api/game-sessions/:gameId/leave
 * Remove the authenticated coach from the active session.
 * Head coach cannot leave — they can only end the game. Returns 400 if head
 * coach attempts to leave.
 */
router.post(
  '/:gameId/leave',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { gameId } = req.params;

    const result = await query(
      `DELETE FROM session_participants sp
         USING game_sessions gs
        WHERE sp.session_id = gs.id
          AND gs.game_id = $1
          AND gs.status = 'active'
          AND sp.coach_id = $2
          AND sp.role <> 'head_coach'
        RETURNING sp.role`,
      [gameId, req.coachId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Not a participant, or head coach cannot leave (end the game instead)', 400);
    }

    logger.info(`Coach ${req.coachId} left game ${gameId}`);
    res.json({ success: true });
  })
);

export default router;
