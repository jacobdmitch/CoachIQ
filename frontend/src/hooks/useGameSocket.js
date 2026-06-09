import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import apiClient from '../config/api';
import { SyncClient } from '../services/syncClient';
import { LocalGameState } from '../services/localGameState';
import { listPending } from '../services/offlineQueue';
import { nearby, makeRoomCode } from '../local/p2p';
import * as store from '../local/localDb';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || window.location.origin;
const LOCAL_MODE = process.env.REACT_APP_LOCAL_MODE === 'true';

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
  // Current proactive Line Coach push, or null. Replace-with-newest: only
  // one is visible at a time; a fresh arrival overwrites the previous.
  // Shape: { pushId, pushedAt, reason, suggestion }
  const [proactivePush, setProactivePush] = useState(null);

  // ─── Nearby (Bluetooth/local-WiFi) multi-coach state ──────────────────────
  const nearbyRoleRef = useRef('idle'); // 'host' | 'guest' | 'idle'
  const [nearbyRole, setNearbyRole] = useState('idle');
  const [nearbyRoom, setNearbyRoom] = useState('');
  const [nearbyPeers, setNearbyPeers] = useState(0);

  // ─── Helper: apply a full server snapshot to our local caches ─────────────
  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    setLiveState(snapshot);
    setClockTime(snapshot.clockTime ?? null);
    if (localStateRef.current) localStateRef.current.replace(snapshot);
    else localStateRef.current = new LocalGameState(snapshot);
  }, []);

  // ─── Nearby: host broadcasts authoritative state; guest applies it ─────────
  const broadcastState = useCallback(async () => {
    if (nearbyRoleRef.current !== 'host' || !gameId) return;
    try {
      const [{ data: s }, { data: pt }] = await Promise.all([
        apiClient.get(`/game-live/${gameId}/state`),
        apiClient.get(`/game-live/${gameId}/playtime`),
      ]);
      nearby.send({ t: 'state', state: s?.state, playtime: pt?.summary, equityFlags: pt?.equityFlags });
    } catch { /* not started yet */ }
  }, [gameId]);

  const sendBootstrap = useCallback(async () => {
    if (!gameId) return;
    try {
      const { data: g } = await apiClient.get(`/games/${gameId}`);
      const teamId = g.game.team_id;
      const { data: r } = await apiClient.get('/athletes', { params: { teamId } });
      let season = null;
      try { season = (await apiClient.get(`/seasons/${g.game.season_id}`)).data.season; } catch { /* none */ }
      const roster = (r.athletes || []).map((a) => ({ ...a, team_id: teamId }));
      nearby.send({ t: 'bootstrap', game: g.game, roster, season });
    } catch { /* ignore */ }
  }, [gameId]);

  const applyBootstrap = useCallback(async (msg) => {
    await store.ready();
    const upsert = (coll, row) => (store.getById(coll, row.id) ? store.update(coll, row.id, row) : store.insert(coll, row));
    if (msg.season) upsert('seasons', msg.season);
    if (msg.game) upsert('games', msg.game);
    (msg.roster || []).forEach((a) => upsert('athletes', a));
    await store.persistNow();
  }, []);

  const handleNearbyMessage = useCallback(async (msg) => {
    if (!msg) return;
    if (nearbyRoleRef.current === 'host') {
      if (msg.t === 'mutation') {
        try {
          const m = String(msg.method || 'POST').toLowerCase();
          if (m === 'post') await apiClient.post(msg.path, msg.body || {});
          else if (m === 'delete') await apiClient.delete(msg.path);
          await broadcastState();
        } catch { /* guest action failed — host stays source of truth */ }
      }
    } else if (nearbyRoleRef.current === 'guest') {
      if (msg.t === 'state' && msg.state) {
        applySnapshot(msg.state);
        if (Array.isArray(msg.playtime)) setPlaytime(msg.playtime);
        if (Array.isArray(msg.equityFlags)) setEquityFlags(msg.equityFlags);
      } else if (msg.t === 'bootstrap') {
        await applyBootstrap(msg);
      }
    }
  }, [broadcastState, applySnapshot, applyBootstrap]);

  const startNearbyHost = useCallback(async () => {
    const room = makeRoomCode();
    nearbyRoleRef.current = 'host';
    setNearbyRole('host');
    setNearbyRoom(room);
    await nearby.startHost(room, {
      onMessage: handleNearbyMessage,
      onPeers: async (peers) => {
        setNearbyPeers(peers.length);
        if (peers.length > 0) { await sendBootstrap(); await broadcastState(); }
      },
    });
    return room;
  }, [handleNearbyMessage, sendBootstrap, broadcastState]);

  const startNearbyGuest = useCallback(async (room) => {
    nearbyRoleRef.current = 'guest';
    setNearbyRole('guest');
    setNearbyRoom(room);
    await nearby.startGuest(room, {
      onMessage: handleNearbyMessage,
      onPeers: (peers) => setNearbyPeers(peers.length),
    });
  }, [handleNearbyMessage]);

  const stopNearby = useCallback(async () => {
    await nearby.stop();
    nearbyRoleRef.current = 'idle';
    setNearbyRole('idle');
    setNearbyPeers(0);
    setNearbyRoom('');
  }, []);

  // Tear down any nearby session when the hook unmounts.
  useEffect(() => () => { nearby.stop().catch(() => {}); }, []);

  // ─── Sync client lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    if (!gameId || !token) return undefined;

    const sync = new SyncClient({
      gameId,
      apiClient,
      localMode: LOCAL_MODE,
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

    if (LOCAL_MODE) {
      // No server in standalone mode — drive the live UI by polling the local
      // engine: clock every second, playtime/equity every five.
      setConnected(true);
      const clockTimer = setInterval(async () => {
        try {
          const { data } = await apiClient.get(`/game-live/${gameId}/state`);
          if (data?.state) { setClockTime(data.state.clockTime ?? null); applySnapshot(data.state); }
        } catch { /* game not started yet */ }
      }, 1000);
      const ptTimer = setInterval(async () => {
        try {
          const { data } = await apiClient.get(`/game-live/${gameId}/playtime`);
          if (Array.isArray(data?.summary)) setPlaytime(data.summary);
          if (Array.isArray(data?.equityFlags)) setEquityFlags(data.equityFlags);
        } catch { /* ignore */ }
      }, 5000);
      return () => { clearInterval(clockTimer); clearInterval(ptTimer); setConnected(false); };
    }

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

    // Proactive Line Coach push. Server picks at most one suggestion per
    // evaluation cycle (see services/ai/proactiveCoach.js) and emits the
    // full push row plus the rec payload. Replace-with-newest: we only
    // hold one on screen at a time; later pushes overwrite.
    socket.on('ai:recommendation', (push) => {
      if (!push || !push.pushId) return;
      setProactivePush(push);
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

    // Optimistic local apply — runs whether online or offline so the UI is
    // instant either way. Server broadcasts will reconcile any drift.
    if (localApply && localStateRef.current) {
      try { localApply(localStateRef.current); } catch { /* ignore */ }
      const snap = localStateRef.current.getState();
      setLiveState(snap);
      if (snap.clockTime != null) setClockTime(snap.clockTime);
    }

    // Guest: the host owns the game. Forward the action over the nearby link
    // and let the host's broadcast reconcile our view.
    if (nearbyRoleRef.current === 'guest') {
      nearby.send({ t: 'mutation', method, path, body });
      return { queued: false, p2p: true };
    }

    if (!sync) return null;
    try {
      const res = await sync.send(method, path, body);
      // Host: push the new authoritative state to connected assistants.
      if (nearbyRoleRef.current === 'host') broadcastState();
      return res;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`${method} ${path} failed:`, err?.response?.data?.error || err.message);
      return null;
    }
  }, [broadcastState]);

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

  // ─── Proactive push ack / dismiss ─────────────────────────────────────────
  // Optimistic: clear local state first so the banner disappears instantly,
  // then POST. A failed API call is logged but not surfaced — the scheduler
  // will either re-push (if the rec still applies) or stay quiet (cooldown).
  const acknowledgePush = useCallback(async (pushId) => {
    if (!pushId) return null;
    setProactivePush(prev => (prev && prev.pushId === pushId ? null : prev));
    try {
      const res = await apiClient.post(`/ai-coach/proactive/${pushId}/ack`);
      return res.data;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('ack push failed:', err?.response?.data?.error || err.message);
      return null;
    }
  }, []);

  const dismissPush = useCallback(async (pushId) => {
    if (!pushId) return null;
    setProactivePush(prev => (prev && prev.pushId === pushId ? null : prev));
    try {
      const res = await apiClient.post(`/ai-coach/proactive/${pushId}/dismiss`);
      return res.data;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('dismiss push failed:', err?.response?.data?.error || err.message);
      return null;
    }
  }, []);

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
    proactivePush,
    acknowledgePush,
    dismissPush,
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
    // Nearby (Bluetooth/local-WiFi) multi-coach
    nearbyRole,
    nearbyRoom,
    nearbyPeers,
    startNearbyHost,
    startNearbyGuest,
    stopNearby,
  };
}
