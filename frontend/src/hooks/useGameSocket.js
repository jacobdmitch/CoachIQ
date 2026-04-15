import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import apiClient from '../config/api';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || window.location.origin;

/**
 * useGameSocket — manages the Socket.io connection for a live game.
 *
 * Connects to the /game namespace when gameId is provided, joins the game room,
 * and returns live game state. Clock and score are controlled via REST calls
 * (POST /game-live/:gameId/clock/start, etc.) — the server then broadcasts
 * updates to all connected clients via socket.
 *
 * @param {string} gameId - The game to join (null = no connection)
 * @param {string} token  - JWT auth token
 */
export function useGameSocket(gameId, token) {
  const socketRef = useRef(null);

  const [connected,  setConnected]  = useState(false);
  const [liveState,  setLiveState]  = useState(null);  // full game state from server
  const [clockTime,  setClockTime]  = useState(null);  // seconds elapsed in period
  const [events,     setEvents]     = useState([]);     // game event log

  useEffect(() => {
    if (!gameId || !token) return;

    const socket = io(`${SOCKET_URL}/game`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_game', { gameId });
    });

    socket.on('disconnect', () => setConnected(false));

    // Full state sync — sent after any major state change (start, period, end)
    socket.on('state_update', ({ state }) => {
      if (state) {
        setLiveState(state);
        setClockTime(state.clockTime ?? null);
      }
    });

    // Clock tick — emitted every second by the server while clock is running
    socket.on('clock_tick', ({ clockTime: t }) => {
      setClockTime(t);
    });

    // Score update — emitted after a score change
    socket.on('score_update', ({ state }) => {
      if (state) {
        setLiveState(prev => prev ? { ...prev, homeScore: state.homeScore, awayScore: state.awayScore } : state);
      }
    });

    // Substitution — emitted after a successful sub
    socket.on('substitution', ({ state }) => {
      if (state) {
        setLiveState(state);
        setEvents(prev => [{ type: 'substitution', ts: Date.now() }, ...prev]);
      }
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

  // ─── Clock control (REST, not socket) ────────────────────────────────────────
  // Clock is controlled via REST so the server can manage the tick interval.
  // Socket events carry the results back to all connected clients.

  const startClock = useCallback(async () => {
    if (!gameId) return;
    try {
      await apiClient.post(`/game-live/${gameId}/clock/start`);
    } catch (err) {
      console.error('startClock failed:', err.response?.data?.error || err.message);
    }
  }, [gameId]);

  const stopClock = useCallback(async () => {
    if (!gameId) return;
    try {
      await apiClient.post(`/game-live/${gameId}/clock/stop`);
    } catch (err) {
      console.error('stopClock failed:', err.response?.data?.error || err.message);
    }
  }, [gameId]);

  const logGoal = useCallback(async (athleteId, assistAthleteId) => {
    if (!gameId) return;
    try {
      await apiClient.post(`/game-live/${gameId}/event`, {
        eventType: 'GOAL',
        athleteId,
        metadata: assistAthleteId ? { assistAthleteId } : {},
      });
    } catch (err) {
      console.error('logGoal failed:', err.response?.data?.error || err.message);
    }
  }, [gameId]);

  const makeSubstitution = useCallback(async (playerOut, playerIn, position) => {
    if (!gameId) return;
    try {
      await apiClient.post(`/game-live/${gameId}/sub`, { playerIn, playerOut, position });
    } catch (err) {
      console.error('makeSubstitution failed:', err.response?.data?.error || err.message);
    }
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
