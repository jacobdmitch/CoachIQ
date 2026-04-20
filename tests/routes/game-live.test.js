import { test, describe, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
process.env.LOG_LEVEL  = 'error';

/**
 * Integration tests for routes/game-live.js — the sideline-critical mutations
 * that run during an active game.
 *
 * Covered here:
 *   - Clock start / stop
 *   - Substitution (valid, invalid role, bad athlete)
 *   - Stat-log event (valid + missing idempotency key)
 *   - Idempotency replay — a second request with the same key short-circuits
 *     to the cached response without re-executing the mutation.
 *
 * Strategy:
 *   - Mock services/database.js with a FIFO queryResponses queue so each
 *     test can stage the exact row sequence it needs.
 *   - Mock routes/game-sync.js (broadcastGameUpdate) so tests don't need a
 *     real Socket.io server.
 *   - Mock services/ai/proactiveCoach.js so onEvent() doesn't schedule real
 *     timers or make Claude calls.
 *   - Use the real liveGameStore and pre-seed it with a real GameStateManager
 *     so ensureGameState returns the in-memory copy (no rehydrate path).
 *
 * What this does NOT cover:
 *   - Clock tick broadcasts (setInterval driven; asserting on timer callbacks
 *     makes tests flaky — the tick handler is small enough to review by eye).
 *   - Real SQL shape of game_events, session_participants, idempotency_records.
 *   - Rehydrate path via ensureGameState (covered by services tests).
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

let queryResponses = [];
const queryCalls   = [];
const queryMock    = mock.fn(async (sql, params) => {
  queryCalls.push({ sql, params });
  if (queryResponses.length === 0) return { rows: [] };
  return queryResponses.shift();
});

const broadcastMock = mock.fn(() => {});
const onEventMock   = mock.fn(() => {});
const registerMock  = mock.fn(() => {});

let app;
let token;
let liveGameStore;
let GameStateManager;

before(async () => {
  mock.module('../../services/database.js', {
    namedExports: {
      query: queryMock,
      initializeDatabase: async () => {},
    },
  });

  mock.module('../../routes/game-sync.js', {
    namedExports: {
      broadcastGameUpdate: broadcastMock,
    },
  });

  mock.module('../../services/ai/proactiveCoach.js', {
    defaultExport: {
      register:   registerMock,
      deregister: () => {},
      onEvent:    onEventMock,
    },
  });

  liveGameStore  = await import('../../services/liveGameStore.js');
  const gsm      = await import('../../services/gameStateManager.js');
  GameStateManager = gsm.default;

  const { default: gameLiveRouter } = await import('../../routes/game-live.js');
  const { errorHandler } = await import('../../middleware/errorHandler.js');

  app = express();
  app.use(express.json());
  app.use('/game-live', gameLiveRouter);
  app.use(errorHandler);

  token = jwt.sign(
    { coachId: 'coach-1', teamId: 'team-1', email: 't@example.com', role: 'coach' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
});

// Clean up any clock intervals the SUT left behind so the test runner exits.
after(() => {
  for (const [, interval] of liveGameStore.clockIntervals.entries()) {
    clearInterval(interval);
  }
  liveGameStore.clockIntervals.clear();
  liveGameStore.gameStates.clear();
  liveGameStore.playtimeTrackers.clear();
});

// Seed a known GameStateManager before each test so ensureGameState hits the
// in-memory path. Athletes cover one field + one bench plus a goalie so subs
// can succeed.
const GAME_ID = '11111111-1111-1111-1111-111111111111';
const IN_ID   = '22222222-2222-2222-2222-222222222222';
const OUT_ID  = '33333333-3333-3333-3333-333333333333';

function makeGameState() {
  const game = { id: GAME_ID, format: 'standard', team_id: 'team-1' };
  const athletes = [
    { id: OUT_ID, first_name: 'Out', last_name: 'Player' },
    { id: IN_ID,  first_name: 'In',  last_name: 'Player' },
  ];
  const gs = new GameStateManager(game, athletes);
  // Put OUT_ID on the field; IN_ID stays on bench.
  gs.fieldPositions.field_0 = OUT_ID;
  gs.bench = gs.bench.filter((id) => id !== OUT_ID);
  gs.period = 1;
  gs.state = 'ACTIVE';
  return gs;
}

beforeEach(() => {
  queryResponses = [];
  queryCalls.length = 0;
  queryMock.mock.resetCalls();
  broadcastMock.mock.resetCalls();
  onEventMock.mock.resetCalls();

  liveGameStore.gameStates.clear();
  liveGameStore.playtimeTrackers.clear();
  for (const [, interval] of liveGameStore.clockIntervals.entries()) {
    clearInterval(interval);
  }
  liveGameStore.clockIntervals.clear();

  liveGameStore.gameStates.set(GAME_ID, makeGameState());
});

// requireGameRole hits session_participants first; stage that response.
function stageHeadCoachRole() {
  queryResponses.push({ rows: [{ role: 'head_coach' }] });
}

// ─── auth gate ──────────────────────────────────────────────────────────────

describe('auth gate', () => {
  test('401 without a token', async () => {
    const res = await request(app).post(`/game-live/${GAME_ID}/clock/start`);
    assert.equal(res.status, 401);
  });
});

// ─── clock ──────────────────────────────────────────────────────────────────

describe('POST /:gameId/clock/start', () => {
  test('200 on success, broadcasts state_update, starts tick interval', async () => {
    stageHeadCoachRole();
    // saveGameStateSnapshot UPDATE returns 1 row so INSERT is skipped.
    queryResponses.push({ rows: [{ id: 'session-1' }] });

    const res = await request(app)
      .post(`/game-live/${GAME_ID}/clock/start`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.event.type, 'CLOCK_STARTED');
    assert.equal(res.body.state.clockRunning, true);
    assert.ok(broadcastMock.mock.callCount() >= 1, 'should broadcast state_update');
    assert.ok(liveGameStore.clockIntervals.has(GAME_ID), 'tick interval should be registered');
  });

  test('400 when clock is already running', async () => {
    liveGameStore.gameStates.get(GAME_ID).startClock(); // flip in-memory state
    stageHeadCoachRole();

    const res = await request(app)
      .post(`/game-live/${GAME_ID}/clock/start`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 400);
    assert.match(res.body.error, /already running/i);
  });

  test('403 when coach is not a participant of the session', async () => {
    // requireGameRole returns empty rows → 403
    queryResponses.push({ rows: [] });

    const res = await request(app)
      .post(`/game-live/${GAME_ID}/clock/start`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 403);
  });
});

describe('POST /:gameId/clock/stop', () => {
  test('200 on success, clears tick interval', async () => {
    liveGameStore.gameStates.get(GAME_ID).startClock();
    // Pretend startClockInterval registered a tick we now need cleared.
    liveGameStore.clockIntervals.set(GAME_ID, setInterval(() => {}, 10_000));

    stageHeadCoachRole();
    queryResponses.push({ rows: [{ id: 'session-1' }] }); // snapshot UPDATE

    const res = await request(app)
      .post(`/game-live/${GAME_ID}/clock/stop`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.event.type, 'CLOCK_STOPPED');
    assert.equal(res.body.state.clockRunning, false);
    assert.ok(!liveGameStore.clockIntervals.has(GAME_ID), 'tick interval should be cleared');
  });

  test('400 when clock is not running', async () => {
    stageHeadCoachRole();

    const res = await request(app)
      .post(`/game-live/${GAME_ID}/clock/stop`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 400);
    assert.match(res.body.error, /not running/i);
  });
});

// ─── substitution ───────────────────────────────────────────────────────────

describe('POST /:gameId/sub', () => {
  test('200 on valid swap, returns updated state and fires proactive onEvent', async () => {
    stageHeadCoachRole();
    // Idempotency lookup empty → falls through to handler. Further queries
    // (persist x2, snapshot UPDATE, idempotency save) are fire-and-forget
    // or resolve fine with default empty rows.

    // Route IN to a different slot than OUT's so executeSubstitution's two
    // sequential writes don't collide on the same key. Sending position
    // equal to outPosition is an existing SUT quirk not under test here.
    const res = await request(app)
      .post(`/game-live/${GAME_ID}/sub`)
      .set('Authorization', `Bearer ${token}`)
      .send({ playerIn: IN_ID, playerOut: OUT_ID, position: 'field_1' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.event.type, 'SUBSTITUTION');
    assert.equal(res.body.event.playerIn, IN_ID);
    assert.equal(res.body.event.playerOut, OUT_ID);
    // Core swap invariants: IN leaves bench, OUT joins bench.
    assert.ok(!res.body.state.bench.includes(IN_ID), 'IN should leave bench');
    assert.ok(res.body.state.bench.includes(OUT_ID),  'OUT should join bench');
    assert.equal(res.body.state.fieldPositions.field_1, IN_ID);
    assert.equal(res.body.state.fieldPositions.field_0, null);
    assert.ok(
      onEventMock.mock.calls.some((c) => c.arguments[1] === 'substitution'),
      'proactive scheduler should be notified'
    );
  });

  test('400 when body fails zod validation (non-UUID playerIn)', async () => {
    stageHeadCoachRole();

    const res = await request(app)
      .post(`/game-live/${GAME_ID}/sub`)
      .set('Authorization', `Bearer ${token}`)
      .send({ playerIn: 'not-a-uuid', playerOut: OUT_ID });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Invalid input/i);
  });

  test('400 when playerIn is not on the bench', async () => {
    stageHeadCoachRole();
    const STRANGER = '99999999-9999-9999-9999-999999999999';

    const res = await request(app)
      .post(`/game-live/${GAME_ID}/sub`)
      .set('Authorization', `Bearer ${token}`)
      .send({ playerIn: STRANGER, playerOut: OUT_ID });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /not on bench/i);
  });
});

// ─── stat-log event ─────────────────────────────────────────────────────────

describe('POST /:gameId/event', () => {
  test('200 on valid GOAL event, returns event with state snapshot', async () => {
    stageHeadCoachRole();

    const res = await request(app)
      .post(`/game-live/${GAME_ID}/event`)
      .set('Authorization', `Bearer ${token}`)
      .send({ eventType: 'GOAL', athleteId: OUT_ID });

    assert.equal(res.status, 200);
    assert.equal(res.body.event.type, 'GOAL');
    assert.equal(res.body.event.athleteId, OUT_ID);
    assert.ok(res.body.state, 'response should include state');
  });

  test('400 on invalid body shape (missing athleteId)', async () => {
    stageHeadCoachRole();

    const res = await request(app)
      .post(`/game-live/${GAME_ID}/event`)
      .set('Authorization', `Bearer ${token}`)
      .send({ eventType: 'GOAL' });

    assert.equal(res.status, 400);
  });
});

// ─── idempotency replay ─────────────────────────────────────────────────────

describe('idempotency replay', () => {
  test('second POST /event with same key returns the cached response', async () => {
    const idempotencyKey = '44444444-4444-4444-4444-444444444444';
    const cachedBody = {
      success: true,
      event: { type: 'GOAL', athleteId: OUT_ID, period: 1, replayed: true },
      state: { replayed: true },
    };

    stageHeadCoachRole();
    // Idempotency lookup returns a cached response.
    queryResponses.push({ rows: [{ response_json: cachedBody }] });

    const res = await request(app)
      .post(`/game-live/${GAME_ID}/event`)
      .set('Authorization', `Bearer ${token}`)
      .send({ eventType: 'GOAL', athleteId: OUT_ID, idempotencyKey });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, cachedBody, 'should short-circuit to the cached body');

    // The in-memory GameState should NOT have a new event appended — the
    // mutation was skipped. The seeded state has no events, so the length
    // stays at 0.
    const gs = liveGameStore.gameStates.get(GAME_ID);
    assert.equal(gs.events.length, 0, 'handler body should not have executed');
  });
});
