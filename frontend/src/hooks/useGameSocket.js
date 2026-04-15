import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';

/**
 * useGameSocket — manages the Socket.io connection for a live game.
 *
 * Connects to the server when gameId is provided, joins the game room,
 * and returns the live game state along with action dispatchers.
 *
 * @param {string} gameId - The game to join (null = no connection)
 * @param {string} token  - JWT auth token
 */
export function useGameSocket(gameId, token) {
  const socketRef = useRef(null);

  const [connected,  setConnected]  = useState(false);
  const [liveState,  setLiveState]  = useState(null);   // game state from server
  const [clockTime,  setClockTime]  = useState(null);   // seconds elapsed
  const [events,     setEvents]     = useState([]);      // event log

  useEffect(() => {
    if (!gameId || !token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_game', { gameId });
    });

    socket.on('disconnect', () => setConnected(false));

    // Full state sync (sent on join and after major changes)
    socket.on('game_state', (state) => {
      setLiveState(state);
      setClockTime(state.clockTime ?? null);
    });

    // Incremental clock tick
    socket.on('clock_tick', ({ clockTime: t }) => {
      setClockTime(t);
    });

    // Score update
    socket.on('score_update', ({ homeScore, awayScore }) => {
      setLiveState(prev => prev ? { ...prev, homeScore, awayScore } : prev);
    });

    // Period change
    socket.on('period_change', ({ period }) => {
      setLiveState(prev => prev ? { ...prev, period } : prev);
    });

    // Substitution / lineup change
    socket.on('lineup_change', (payload) => {
      setLiveState(prev => prev ? { ...prev, fieldPositions: payload.fieldPositions, bench: payload.bench } : prev);
      setEvents(prev => [{ type: 'substitution', ...payload, ts: Date.now() }, ...prev]);
    });

    // Generic game event (goal, penalty, etc.)
    socket.on('game_event', (event) => {
      setEvents(prev => [{ ...event, ts: Date.now() }, ...prev]);
    });

    return () => {
      socket.emit('leave_game', { gameId });
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [gameId, token]);

  // ─── Action dispatchers ─────────────────────────────────────────────────────

  const startClock = useCallback(() => {
    socketRef.current?.emit('clock_start', { gameId });
  }, [gameId]);

  const stopClock = useCallback(() => {
    socketRef.current?.emit('clock_stop', { gameId });
  }, [gameId]);

  const logGoal = useCallback((athleteId, assistAthleteId) => {
    socketRef.current?.emit('log_goal', { gameId, athleteId, assistAthleteId });
  }, [gameId]);

  const makeSubstitution = useCallback((outAthleteId, inAthleteId, position) => {
    socketRef.current?.emit('substitution', { gameId, outAthleteId, inAthleteId, position });
  }, [gameId]);

  return {
    connected,
    liveState,
    clockTime,
    events,
    startClock,
    stopClock,
    logGoal,
    makeSubstitution,
  };
}
