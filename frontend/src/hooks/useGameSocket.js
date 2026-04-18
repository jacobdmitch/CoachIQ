import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import apiClient from '../config/api';
import { SyncClient } from '../services/syncClient';
import { LocalGameState } from '../services/localGameState';
import { listPending } from '../services/offlineQueue';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || window.location.origin;

/**
 * useGameSocket — manages the live-game connection.
 *
 * Online behavior (unchanged): connects to the /game namespace, joins the
 * game room, and renders liveState from server broadcasts. Clock/score/subs
 * flow through REST; the server persists and broadcasts back.
 *
 * Offline behavior (phase 3): mutations route through a SyncClient that
 * queues to IndexedDB when disconnected, and replays on reconnect using
 * pre-assigned idempotencyKeys. While queued, a LocalGameState simulator
 * applies the mutation optimistically so the UI keeps moving. After the
 * queue drains, the client reconciles from /events-since/:seqNo so any
 * co-coach edits made during the outage are pulled in.
 *
 * @param {string} gameId - The game to join (null = no connection)
 * @param {string} token  - JWT auth token
 */
export function useGameSocket(gameId, token) {
  const socketRef     = useRef(null);
  const syncRef       = useRef(null);
  const localStateRef = useRef(null);

  const [connected,    setConnected]    = useState(false);  // socket connected
  const [online,       setOnline]       = useState(true);   // REST reachable
  const [queueLength,  setQueueLength]  = useState(0);      // pending ops in IDB
  const [liveState,    setLiveState]    = useState(null);
  const [clockTime,    setClockTime]    = useState(null);
  const [events,       setEvents]       = useState([]);
  const [mergeAlerts,  setMergeAlerts]  = useState([]);
  const [activating,   setActivating]   = useState(false);
  const [playtime,     setPlaytime]     = useState([]);
  const [equityFlags,  setEquityFlags]  = useState([]);
  const [threats,      setThreats]      = useState([]);

  // ─── Helper: apply a full server snapshot to our local caches ─────────────
  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    setLiveState(snapshot);
    setClockTime(snapshot.clockTime ?? null);
    if (localStateRef.current) localStateRef.current.replace(snapshot);
    else localStateRef.current = new LocalGameState(snapshot);
  }, []);

  // ─── Sync client lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    if (!gameId || !token) return undefined;

    const sync = new SyncClient({
      gameId,
      apiClient,
      onOnline:  () => setOnline(true),
      onOffline: () => setOnline(false),
      onQueueChange: (ops) => setQueueLength(ops.length),
      onReconcile: ({ snapshot, latestSeqNo }) => {
        applySnapshot(snapshot);
        if (typeof latestSeqNo === 'number') sync.setLatestSeqNo(latestSeqNo);
      },
      onError: (err) => {
        // eslint-disable-next-line no-console
        console.error('sync error:', err?.response?.data?.error || err.message);
      },
    });
    syncRef.current = sync;
    sync.start();

    // Prime the initial queue-length badge
    listPending(gameId).then(ops => setQueueLength(ops.length)).catch(() => {});

    // Pull the initial snapshot + seq_no so later reconciles have a cursor.
    sync.reconcile().catch(() => {});

    return () => {
      sync.stop();
      syncRef.current = null;
    };
  }, [gameId, token, applySnapshot]);

  // ─── Socket lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameId || !token) return undefined;

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

    socket.on('state_update', ({ state }) => {
      if (state) applySnapshot(state);
    });

    socket.on('clock_tick', ({ clockTime: t }) => {
      setClockTime(t);
      if (localStateRef.current) {
        // Keep local state in sync so a late-arriving offline window picks up
        // the correct clock baseline.
        const s = localStateRef.current.getState();
        s.clockTime = t;
        localStateRef.current.replace(s);
      }
    });

    socket.on('playtime_tick', ({ summary, equityFlags: flags }) => {
      if (Array.isArray(summary)) setPlaytime(summary);
      if (Array.isArray(flags))   setEquityFlags(flags);
    });

    socket.on('opponent_threats', ({ threats: list }) => {
      if (Array.isArray(list)) setThreats(list);
    });

    socket.on('score_update', ({ state }) => {
      if (state) {
        setLiveState(prev => prev ? { ...prev, homeScore: state.homeScore, awayScore: state.awayScore } : state);
        if (localStateRef.current) {
          localStateRef.current.updateScore('home', state.homeScore);
          localStateRef.current.updateScore('away', state.awayScore);
        }
      }
    });

    socket.on('substitution', ({ state }) => {
      if (state) {
        applySnapshot(state);
        setEvents(prev => [{ type: 'substitution', ts: Date.now() }, ...prev]);
      }
    });

    socket.on('game_event', (event) => {
      setEvents(prev => [{ ...event, ts: Date.now() }, ...prev]);
    });

    socket.on('queue_update', ({ subQueue, mergeAlerts: alerts }) => {
      setLiveState(prev => prev ? { ...prev, subQueue: subQueue || [] } : prev);
      if (alerts?.length > 0) setMergeAlerts(alerts);
    });

    socket.on('batch_substitution', ({ state }) => {
      if (state) {
        applySnapshot(state);
        setMergeAlerts([]);
      }
    });

    return () => {
      socket.emit('leave_game', { gameId });
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [gameId, token, applySnapshot]);

  // ─── Helper: route a mutation through sync + local optimistic apply ───────
  const send = useCallback(async (method, path, body, localApply) => {
    const sync = syncRef.current;
    if (!sync) return null;

    // Optimistic local apply — runs whether online or offline so the UI is
    // instant either way. Server broadcasts will reconcile any drift.
    if (localApply && localStateRef.current) {
      try { localApply(localStateRef.current); } catch { /* ignore */ }
      const snap = localStateRef.current.getState();
      setLiveState(snap);
      if (snap.clockTime != null) setClockTime(snap.clockTime);
    }

    try {
      return await sync.send(method, path, body);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`${method} ${path} failed:`, err?.response?.data?.error || err.message);
      return null;
    }
  }, []);

  // ─── Clock ────────────────────────────────────────────────────────────────
  const startClock = useCallback(() => send(
    'POST', `/game-live/${gameId}/clock/start`, null,
    (local) => local.startClock()
  ), [gameId, send]);

  const stopClock = useCallback(() => send(
    'POST', `/game-live/${gameId}/clock/stop`, null,
    (local) => local.stopClock()
  ), [gameId, send]);

  // ─── Events ───────────────────────────────────────────────────────────────
  const logGoal = useCallback((athleteId, assistAthleteId) => send(
    'POST', `/game-live/${gameId}/event`,
    { eventType: 'GOAL', athleteId, metadata: assistAthleteId ? { assistAthleteId } : {} },
    (local) => local.logEvent('GOAL', athleteId, assistAthleteId ? { assistAthleteId } : {})
  ), [gameId, send]);

  // Generic stat logger used by the long-press action menu. eventType values
  // match the DB enum (GOAL, SHOT, GROUND_BALL, TURNOVER, etc.). Works offline
  // via the same sync/local-state path as logGoal.
  const logStat = useCallback((eventType, athleteId, metadata = {}) => send(
    'POST', `/game-live/${gameId}/event`,
    { eventType, athleteId, metadata },
    (local) => local.logEvent(eventType, athleteId, metadata)
  ), [gameId, send]);

  const logOpponentEvent = useCallback((eventType, opposingPlayerId = null, metadata = {}) => send(
    'POST', `/game-live/${gameId}/opponent-event`,
    { eventType, opposingPlayerId, metadata },
    (local) => local.logOpponentEvent(eventType, opposingPlayerId, metadata)
  ), [gameId, send]);

  const makeSubstitution = useCallback((playerOut, playerIn, position) => send(
    'POST', `/game-live/${gameId}/sub`,
    { playerIn, playerOut, position },
    (local) => local.executeSubstitution(playerIn, playerOut, position)
  ), [gameId, send]);

  // ─── Sub queue ────────────────────────────────────────────────────────────
  const addToQueue = useCallback(async (params) => {
    const result = await send(
      'POST', `/game-live/${gameId}/sub-queue/add`, params,
      (local) => local.addToQueue(params.entry || params)
    );
    if (result?.response?.mergeAlerts?.length > 0) {
      setMergeAlerts(result.response.mergeAlerts);
    }
    return result;
  }, [gameId, send]);

  const removeFromQueue = useCallback((queueId) => send(
    'DELETE', `/game-live/${gameId}/sub-queue/${queueId}`, null,
    (local) => local.removeFromQueue(queueId)
  ), [gameId, send]);

  const removeMoveFromQueue = useCallback((queueId, moveId) => send(
    'DELETE', `/game-live/${gameId}/sub-queue/${queueId}/moves/${moveId}`, null,
    (local) => local.removeMoveFromQueue(queueId, moveId)
  ), [gameId, send]);

  const activateQueue = useCallback(async () => {
    setActivating(true);
    try {
      const result = await send(
        'POST', `/game-live/${gameId}/batch-sub`, {},
        (local) => local.executeBatchSub()
      );
      setMergeAlerts([]);
      return result;
    } finally {
      setActivating(false);
    }
  }, [gameId, send]);

  const dismissMergeAlerts = useCallback(() => setMergeAlerts([]), []);

  return {
    connected,
    online,
    queueLength,
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
    logStat,
    logOpponentEvent,
    makeSubstitution,
    addToQueue,
    removeFromQueue,
    removeMoveFromQueue,
    activateQueue,
    dismissMergeAlerts,
  };
}
