import { test, describe, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for services/gamePersistence.js.
 *
 * Focus: the snapshot round-trip that powers server-restart recovery.
 * saveGameStateSnapshot writes JSONB into game_sessions; loadGameStateSnapshot
 * reads the row back; routes/game-live.js calls both when rehydrating a game
 * into the in-memory gameStates Map.
 *
 * Strategy mirrors tests/routes/auth.test.js:
 *   - Mock services/database.js so the module runs without a real Postgres.
 *   - Use a FIFO queryResponses queue (not mockImplementationOnce) so queued
 *     impls can't leak between tests.
 *
 * Not covered (deliberate — would require a real DB):
 *   - game_events/playtime_log constraints and enum validation.
 *   - The head_coach_id lookup used by ensureGameState to re-register the
 *     proactive scheduler on rehydrate — that is exercised in the routes
 *     test harness, not here.
 */

process.env.LOG_LEVEL = 'error';

let queryResponses = [];
const queryCalls   = [];
const queryMock    = mock.fn(async (sql, params) => {
  queryCalls.push({ sql, params });
  if (queryResponses.length === 0) return { rows: [] };
  return queryResponses.shift();
});

let persistence;

before(async () => {
  mock.module('../../services/database.js', {
    namedExports: {
      query: queryMock,
      initializeDatabase: async () => {},
    },
  });

  persistence = await import('../../services/gamePersistence.js');
});

beforeEach(() => {
  queryResponses = [];
  queryCalls.length = 0;
  queryMock.mock.resetCalls();
});

// A minimal GameState stand-in. We only need getState() and .format.
function fakeGameState(overrides = {}) {
  const state = {
    gameId: 'game-1',
    format: 'standard',
    state: 'in_progress',
    period: 2,
    clockRunning: false,
    clockTime: 450,
    periodDuration: 900,
    homeScore: 3,
    awayScore: 1,
    fieldPositions: { attack1: { athleteId: 'a1' } },
    bench: [{ athleteId: 'a2' }],
    subQueue: [],
    events: [{ type: 'GOAL', athleteId: 'a1', period: 2 }],
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
  return {
    format: state.format,
    getState: () => state,
  };
}

// ─── saveGameStateSnapshot ──────────────────────────────────────────────────

describe('saveGameStateSnapshot', () => {
  test('UPDATEs existing active session when one exists', async () => {
    queryResponses = [{ rows: [{ id: 'session-1' }] }];

    await persistence.saveGameStateSnapshot('game-1', 'coach-1', fakeGameState());

    assert.equal(queryCalls.length, 1, 'should not fall through to INSERT');
    assert.match(queryCalls[0].sql, /UPDATE\s+game_sessions/);
    const [stateJson, gameId] = queryCalls[0].params;
    assert.equal(gameId, 'game-1');
    const parsed = JSON.parse(stateJson);
    assert.equal(parsed.period, 2);
    assert.equal(parsed.homeScore, 3);
  });

  test('INSERTs a new session with join code when no active session exists', async () => {
    queryResponses = [
      { rows: [] },              // UPDATE hits no row
      { rows: [{ id: 'new' }] }, // INSERT
    ];

    await persistence.saveGameStateSnapshot('game-2', 'coach-2', fakeGameState({ gameId: 'game-2' }));

    assert.equal(queryCalls.length, 2);
    assert.match(queryCalls[1].sql, /INSERT\s+INTO\s+game_sessions/);
    const [gameId, joinCode, headCoachId, format /*, stateJson */] = queryCalls[1].params;
    assert.equal(gameId, 'game-2');
    assert.equal(headCoachId, 'coach-2');
    assert.equal(format, 'standard');
    assert.match(joinCode, /^[A-Z0-9]{6}$/, 'join code should be 6 upper alphanumeric chars');
  });

  test('swallows DB errors so live gameplay is never interrupted', async () => {
    queryMock.mock.mockImplementationOnce(async () => { throw new Error('conn refused'); });

    // Must not throw.
    await persistence.saveGameStateSnapshot('game-3', 'coach-3', fakeGameState());
  });
});

// ─── loadGameStateSnapshot ──────────────────────────────────────────────────

describe('loadGameStateSnapshot', () => {
  test('returns the parsed JSONB state when an active session exists', async () => {
    const saved = fakeGameState().getState();
    queryResponses = [{ rows: [{ game_state: saved }] }];

    const loaded = await persistence.loadGameStateSnapshot('game-1');

    assert.equal(queryCalls.length, 1);
    assert.match(queryCalls[0].sql, /SELECT\s+game_state\s+FROM\s+game_sessions/);
    assert.equal(queryCalls[0].params[0], 'game-1');
    assert.deepEqual(loaded, saved, 'loaded state should round-trip the saved state');
  });

  test('returns null when no active session row exists', async () => {
    queryResponses = [{ rows: [] }];

    const loaded = await persistence.loadGameStateSnapshot('no-such-game');
    assert.equal(loaded, null);
  });

  test('returns null when the row exists but game_state is NULL', async () => {
    queryResponses = [{ rows: [{ game_state: null }] }];

    const loaded = await persistence.loadGameStateSnapshot('game-x');
    assert.equal(loaded, null);
  });

  test('returns null and logs on DB error (does not throw)', async () => {
    queryMock.mock.mockImplementationOnce(async () => { throw new Error('timeout'); });

    const loaded = await persistence.loadGameStateSnapshot('game-boom');
    assert.equal(loaded, null);
  });
});

// ─── save → load round-trip ─────────────────────────────────────────────────

describe('snapshot round-trip (save then load)', () => {
  test('state saved with INSERT is identical when loaded back', async () => {
    // Capture what saveGameStateSnapshot would INSERT as JSON text, then
    // hand it back to loadGameStateSnapshot as if Postgres parsed the JSONB.
    queryResponses = [
      { rows: [] },              // UPDATE no-op
      { rows: [{ id: 'new' }] }, // INSERT
    ];

    const original = fakeGameState({
      gameId: 'rt-1',
      period: 3,
      homeScore: 5,
      awayScore: 4,
      events: [{ type: 'GOAL' }, { type: 'SAVE' }],
    });

    await persistence.saveGameStateSnapshot('rt-1', 'coach-rt', original);

    // Parse what the INSERT sent in param $5 (0-indexed 4).
    const insertParams = queryCalls[1].params;
    const storedJsonText = insertParams[4];
    const pgWouldReturn  = JSON.parse(storedJsonText);

    // Now simulate the load.
    queryResponses = [{ rows: [{ game_state: pgWouldReturn }] }];
    const loaded = await persistence.loadGameStateSnapshot('rt-1');

    assert.deepEqual(loaded, original.getState());
  });
});
