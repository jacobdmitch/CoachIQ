import { query } from '../services/database.js';
import { AppError } from './errorHandler.js';

/**
 * Game session role enforcement.
 *
 * Every mutation against /game-live runs through this middleware to confirm
 * the authenticated coach is a participant of the active session and, if
 * the caller named allowed roles, that their role is in that set.
 *
 * The check hits session_participants joined to game_sessions. Head coach
 * is added as a participant when the game is started (see routes/game-live
 * start handler), so we don't need a separate "is head coach" path.
 *
 * Roles:
 *   head_coach   — full control: clock, subs, scores, events, ends game
 *   assistant    — same as head_coach except end game
 *   stat_tracker — stat entry only: /event, /opponent-event, /event/last, /score
 */
export function requireGameRole(allowedRoles) {
  return async (req, res, next) => {
    const { gameId } = req.params;
    if (!gameId) return next(new AppError('gameId is required for role check', 400));

    try {
      const result = await query(
        `SELECT sp.role
           FROM session_participants sp
           JOIN game_sessions gs ON sp.session_id = gs.id
          WHERE gs.game_id = $1 AND gs.status = 'active' AND sp.coach_id = $2`,
        [gameId, req.coachId]
      );

      if (result.rows.length === 0) {
        return next(new AppError('Not a participant of this game session', 403));
      }

      const role = result.rows[0].role;
      req.gameRole = role;

      if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
        return next(new AppError(
          `Role "${role}" cannot perform this action. Allowed: ${allowedRoles.join(', ')}`,
          403
        ));
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Ensure the head coach of a newly-started game is recorded as a participant.
 * Idempotent — ON CONFLICT DO NOTHING on the (session_id, coach_id) unique.
 */
export async function ensureHeadCoachParticipant(gameId, coachId) {
  await query(
    `INSERT INTO session_participants (session_id, coach_id, role)
     SELECT gs.id, $2, 'head_coach'
       FROM game_sessions gs
      WHERE gs.game_id = $1 AND gs.status = 'active'
     ON CONFLICT (session_id, coach_id) DO NOTHING`,
    [gameId, coachId]
  );
}
