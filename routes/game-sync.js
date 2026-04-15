import logger from '../services/logger.js';

/**
 * Setup Socket.io game sync namespace.
 * Clients join a room keyed by gameId. Any game-live endpoint can broadcast
 * state changes to all connected clients watching that game.
 */
let gameNamespace = null;

export default function setupGameSync(io) {
  gameNamespace = io.of('/game');

  gameNamespace.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id}`);

    // Client joins a game room
    socket.on('join_game', (data) => {
      const { gameId, joinCode } = data || {};
      if (!gameId) {
        socket.emit('error', { message: 'gameId required' });
        return;
      }

      socket.join(gameId);
      logger.info(`Socket ${socket.id} joined game room ${gameId}`);
      socket.emit('game_joined', { success: true, gameId });
    });

    // Legacy support for join_session
    socket.on('join_session', (data) => {
      if (data?.joinCode) {
        socket.join(data.joinCode);
        socket.emit('session_joined', { success: true, joinCode: data.joinCode });
      }
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
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
