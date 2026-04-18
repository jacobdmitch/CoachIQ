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

  const [connected,    setConnected]    = useState(false);
  const [liveState,    setLiveState]    = useState(null);  // full game state from server
  const [clockTime,    setClockTime]    = useState(null);  // seconds elapsed in period
  const [events,       setEvents]       = useState([]);    // game event log
  const [mergeAlerts,  setMergeAlerts]  = useState([]);    // sub queue conflict alerts
  const [activating,   setActivating]   = useState(false); // batch-sub in-flight
  const [playtime,     setPlaytime]     = useState([]);    // live per-athlete playtime summary
  const [equityFlags,  setEquityFlags]  = useState([]);    // live playtime equity flags
  const [threats,      setThreats]      = useState([]);    // opposing-player threat ranking

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

    // Playtime tick — emitted periodically while the clock runs (every few
    // seconds) with the current per-athlete summary and equity flags.
    socket.on('playtime_tick', ({ summary, equityFlags: flags }) => {
      if (Array.isArray(summary))      setPlaytime(summary);
      if (Array.isArray(flags))        setEquityFlags(flags);
    });

    // Opponent threats — emitted after each logged opponent event so the
    // sideline panel reflects the new score without a refresh.
    socket.on('opponent_threats', ({ threats: list }) => {
      if (Array.isArray(list)) setThreats(list);
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

    // Sub queue updated (add/remove entry/move from any connected coach)
    socket.on('queue_update', ({ subQueue, mergeAlerts: alerts }) => {
      setLiveState(prev => prev ? { ...prev, subQueue: subQueue || [] } : prev);
      if (alerts?.length > 0) setMergeAlerts(alerts);
    });

    // Batch sub executed — full state refresh + clear alerts
    socket.on('batch_substitution', ({ state }) => {
      if (state) {
        setLiveState(state);
        setMergeAlerts([]);
      }
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

  // Clock control errors propagate so the caller can revert optimistic UI
  // state and surface a toast — silently swallowing them caused the "Start"
  // button to flip without the server ever ticking the clock.
  const startClock = useCallback(async () => {
    if (!gameId) return;
    await apiClient.post(`/game-live/${gameId}/clock/start`);
  }, [gameId]);

  const stopClock = useCallback(async () => {
    if (!gameId) return;
    await apiClient.post(`/game-live/${gameId}/clock/stop`);
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

  // Log a stat event for the opposing team.
  // eventType is lowercase (matches the DB enum): 'goal','shot','ground_ball',etc.
  // opposingPlayerId is optional — pass null for an anonymous team-level stat.
  const logOpponentEvent = useCallback(async (eventType, opposingPlayerId = null, metadata = {}) => {
    if (!gameId) return;
    try {
      await apiClient.post(`/game-live/${gameId}/opponent-event`, {
        eventType,
        opposingPlayerId,
        metadata,
      });
    } catch (err) {
      console.error('logOpponentEvent failed:', err.response?.data?.error || err.message);
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

  // ─── Sub queue actions ────────────────────────────────────────────────────

  const addToQueue = useCallback(async (params) => {
    if (!gameId) return;
    try {
      const res = await apiClient.post(`/game-live/${gameId}/sub-queue/add`, params);
      if (res.data.mergeAlerts?.length > 0) setMergeAlerts(res.data.mergeAlerts);
    } catch (err) {
      console.error('addToQueue failed:', err.response?.data?.error || err.message);
    }
  }, [gameId]);

  const removeFromQueue = useCallback(async (queueId) => {
    if (!gameId) return;
    try {
      await apiClient.delete(`/game-live/${gameId}/sub-queue/${queueId}`);
    } catch (err) {
      console.error('removeFromQueue failed:', err.response?.data?.error || err.message);
    }
  }, [gameId]);

  const removeMoveFromQueue = useCallback(async (queueId, moveId) => {
    if (!gameId) return;
    try {
      await apiClient.delete(`/game-live/${gameId}/sub-queue/${queueId}/moves/${moveId}`);
    } catch (err) {
      console.error('removeMoveFromQueue failed:', err.response?.data?.error || err.message);
    }
  }, [gameId]);

  const activateQueue = useCallback(async () => {
    if (!gameId) return;
    setActivating(true);
    try {
      await apiClient.post(`/game-live/${gameId}/batch-sub`);
      setMergeAlerts([]);
    } catch (err) {
      console.error('activateQueue failed:', err.response?.data?.error || err.message);
    } finally {
      setActivating(false);
    }
  }, [gameId]);

  const dismissMergeAlerts = useCallback(() => setMergeAlerts([]), []);

  return {
    connected,
    liveState,
    clockTime,
    events,
    mergeAlerts,
    activating,
    playtime,
    equityFlags,
    threats,
    startClock,
    stopClock,
    logGoal,
    logOpponentEvent,
    makeSubstitution,
    addToQueue,
    removeFromQueue,
    removeMoveFromQueue,
    activateQueue,
    dismissMergeAlerts,
  };
}
