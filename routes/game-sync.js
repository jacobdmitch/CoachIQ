import jwt from 'jsonwebtoken';
import logger from '../services/logger.js';
import { query } from '../services/database.js';

/**
 * Setup Socket.io game sync namespace.
 *
 * Sockets carry an `auth.token` (JWT) in the handshake. The middleware below
 * verifies it and attaches `socket.coachId` for downstream use. join_game
 * then confirms the coach is a session participant before adding them to the
 * room; unauthenticated or non-participant sockets are rejected.
 */
let gameNamespace = null;

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export default function setupGameSync(io) {
  gameNamespace = io.of('/game');

  // ─── Auth handshake ────────────────────────────────────────────────────────
  gameNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('auth token required'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.coachId = decoded.coachId;
      next();
    } catch (err) {
      next(new Error('invalid or expired token'));
    }
  });

  gameNamespace.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id} (coach ${socket.coachId})`);

    // Client joins a game room. Must be a session participant.
    socket.on('join_game', async (data) => {
      const { gameId } = data || {};
      if (!gameId) {
        socket.emit('error', { message: 'gameId required' });
        return;
      }

      try {
        const result = await query(
          `SELECT sp.role
             FROM session_participants sp
             JOIN game_sessions gs ON sp.session_id = gs.id
            WHERE gs.game_id = $1 AND gs.status = 'active' AND sp.coach_id = $2`,
          [gameId, socket.coachId]
        );
        if (result.rows.length === 0) {
          socket.emit('error', { message: 'Not a participant of this game session' });
          return;
        }
        const role = result.rows[0].role;

        socket.join(gameId);
        socket.gameId = gameId;
        socket.gameRole = role;
        logger.info(`Socket ${socket.id} (coach ${socket.coachId}, role ${role}) joined game ${gameId}`);
        socket.emit('game_joined', { success: true, gameId, role });

        // Notify others that a new participant is connected so the "who's
        // on the sideline" badge stays live.
        socket.to(gameId).emit('participant_joined', { coachId: socket.coachId, role });
      } catch (err) {
        logger.warn(`join_game failed for socket ${socket.id}: ${err.message}`);
        socket.emit('error', { message: 'join_game failed' });
      }
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
      if (socket.gameId) {
        socket.to(socket.gameId).emit('participant_left', { coachId: socket.coachId });
      }
    });
  });
}

/**
 * Broadcast a game state update to all clients in a game room.
 * Called from game-live routes after state-changing actions.
 *
 * @param {string} gameId - Game UUID (room name)
 * @param {string} eventType - Event type (e.g. 'state_update', 'substitution', 'score_update')
 * @param {Object} payload - Data to send
 */
export function broadcastGameUpdate(gameId, eventType, payload) {
  if (!gameNamespace) return;
  gameNamespace.to(gameId).emit(eventType, payload);
}
