import { test, describe, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Scaffold test for the proactive Line Coach scheduler.
 *
 * Strategy (mirrors tests/routes/lines-rotations.test.js):
 *   - Mock services/database.js, services/lineCoachEngine.js, and
 *     routes/game-sync.js so the scheduler runs end-to-end without a real
 *     Postgres, a real Anthropic call, or a real Socket.io server.
 *   - Use the real liveGameStore so register/onEvent have something to
 *     read.
 *
 * Flow covered:
 *   register(gameId) → onEvent(gameId, 'substitution') →
 *     engine returns a suggestion →
 *     row inserted into proactive_push_log (captured by the DB mock) →
 *     broadcastGameUpdate emits ai:recommendation (captured by sync mock) →
 *     acknowledge(pushId) mutates the row →
 *     dismiss(pushId) mutates the row and extends the type cooldown.
 *
 * What this does NOT cover (deferred until migration 017 is applied to the
 * test DB, tracked in task #20's follow-up):
 *   - Real SQL shape of proactive_push_log (constraints, defaults, indexes).
 *   - Claude output schema drift — suggestions are hand-crafted here.
 *   - Socket.io wire format — we only assert broadcastGameUpdate args.
 *
 * The pure selection / cooldown logic is already covered at the bottom via
 * the _internal export, which does not need module mocks.
 */

process.env.LOG_LEVEL = 'error';

// ─── Module mocks (must be installed before importing the SUT) ──────────────

// Stateful query mock. Each test case replaces the implementation.
const queryMock = mock.fn(async () => ({ rows: [] }));

// Engine mock. Each test replaces _impl to control the returned suggestions.
const engineImpl = { fn: async () => ({ suggestions: [], error: null }) };
const engineMock = mock.fn((...args) => engineImpl.fn(...args));

// Socket broadcast mock. Tests read .mock.calls.
const broadcastMock = mock.fn(() => {});

// liveGameStore is the only real module here — we populate it per test.
let liveGameStore;
let proactiveCoach;   // default export (register/deregister/onEvent/...)
let pcInternal;       // named export with _pickWinner + schedulers Map

before(async () => {
  mock.module('../../services/database.js', {
    namedExports: {
      query: queryMock,
      initializeDatabase: async () => {},
    },
  });

  mock.module('../../services/lineCoachEngine.js', {
    namedExports: {
      getLineCoachRecommendation: engineMock,
    },
  });

  mock.module('../../routes/game-sync.js', {
    namedExports: {
      broadcastGameUpdate: broadcastMock,
    },
  });

  liveGameStore = await import('../../services/liveGameStore.js');
  const mod     = await import('../../services/ai/proactiveCoach.js');
  proactiveCoach = mod.default;
  pcInternal     = mod._internal;
});

// Safety net: clear any scheduler an assertion-aborted test left behind.
// Without this, leaked setIntervals keep the test runner alive.
after(() => {
  for (const gameId of Array.from(pcInternal.schedulers.keys())) {
    proactiveCoach.deregister(gameId);
  }
});

// Reset mocks + store between tests so state doesn't leak.
beforeEach(() => {
  queryMock.mock.resetCalls();
  engineMock.mock.resetCalls();
  broadcastMock.mock.resetCalls();
  liveGameStore.gameStates.clear();
  liveGameStore.playtimeTrackers.clear();

  // Default: DB returns empty (insert/update callers must override).
  queryMock.mock.mockImplementation(async () => ({ rows: [] }));
  engineImpl.fn = async () => ({ suggestions: [], error: null });
});

// Convenience — install a game in the store so _evaluate proceeds.
function seedGame(gameId, overrides = {}) {
  liveGameStore.gameStates.set(gameId, {
    clockRunning: true,
    period: 1,
    homeScore: 0,
    awayScore: 0,
    fieldPositions: {},
    ...overrides,
  });
}

// ─── register / deregister ──────────────────────────────────────────────────

describe('proactiveCoach: register / deregister', () => {
  test('register installs a scheduler; deregister removes it', () => {
    proactiveCoach.register('g1', { coachId: 'c1', teamId: 't1', format: 'standard' });
    assert.ok(pcInternal.schedulers.has('g1'));

    proactiveCoach.deregister('g1');
    assert.equal(pcInternal.schedulers.has('g1'), false);
  });

  test('register twice replaces the prior scheduler (no orphan interval)', () => {
    proactiveCoach.register('g1', { coachId: 'c1' });
    const first = pcInternal.schedulers.get('g1');
    proactiveCoach.register('g1', { coachId: 'c2' });
    const second = pcInternal.schedulers.get('g1');
    assert.notEqual(first, second);
    assert.equal(second.ctx.coachId, 'c2');
    proactiveCoach.deregister('g1');
  });
});

// ─── onEvent → persist → emit ───────────────────────────────────────────────

describe('proactiveCoach: onEvent push flow', () => {
  test('produces a push row and emits ai:recommendation', async () => {
    seedGame('g1');
    proactiveCoach.register('g1', { coachId: 'c1', teamId: 't1', format: 'standard' });

    engineImpl.fn = async () => ({
      suggestions: [{
        type: 'SUBSTITUTION',
        urgency: 'high',
        playerIn:  'athlete-in',
        playerOut: 'athlete-out',
        position:  'M1',
        reason:    'Fresh legs on the wing',
      }],
      error: null,
    });

    // INSERT into proactive_push_log returns the new row.
    queryMock.mock.mockImplementation(async (sql /* , params */) => {
      if (/INSERT INTO proactive_push_log/i.test(sql)) {
        return { rows: [{ id: 'push-1', pushed_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    });

    await proactiveCoach.onEvent('g1', 'substitution');

    // Engine got called once with isLiveGame: true
    assert.equal(engineMock.mock.callCount(), 1);
    assert.equal(engineMock.mock.calls[0].arguments[2].isLiveGame, true);

    // One INSERT into proactive_push_log
    const inserts = queryMock.mock.calls.filter(
      c => /INSERT INTO proactive_push_log/i.test(c.arguments[0])
    );
    assert.equal(inserts.length, 1);

    // Socket emit fired with the right shape
    assert.equal(broadcastMock.mock.callCount(), 1);
    const [emittedGameId, eventName, payload] = broadcastMock.mock.calls[0].arguments;
    assert.equal(emittedGameId, 'g1');
    assert.equal(eventName, 'ai:recommendation');
    assert.equal(payload.pushId, 'push-1');
    assert.equal(payload.suggestion.type, 'SUBSTITUTION');
    assert.equal(payload.reason, 'substitution');

    proactiveCoach.deregister('g1');
  });

  test('no suggestions → no push, no emit', async () => {
    seedGame('g1');
    proactiveCoach.register('g1', { coachId: 'c1' });

    engineImpl.fn = async () => ({ suggestions: [], error: null });

    await proactiveCoach.onEvent('g1', 'score');

    assert.equal(queryMock.mock.callCount(), 0);
    assert.equal(broadcastMock.mock.callCount(), 0);
    proactiveCoach.deregister('g1');
  });

  test('engine error → no push', async () => {
    seedGame('g1');
    proactiveCoach.register('g1', { coachId: 'c1' });

    engineImpl.fn = async () => ({ suggestions: null, error: 'engine blew up' });

    await proactiveCoach.onEvent('g1', 'period_end');

    assert.equal(broadcastMock.mock.callCount(), 0);
    proactiveCoach.deregister('g1');
  });

  test('onEvent on unknown game is a no-op', async () => {
    // Not registered, store empty — must not crash or call engine.
    await proactiveCoach.onEvent('ghost-game', 'score');
    assert.equal(engineMock.mock.callCount(), 0);
  });

  test('global cooldown blocks back-to-back pushes of the same type', async () => {
    seedGame('g1');
    proactiveCoach.register('g1', { coachId: 'c1' });

    engineImpl.fn = async () => ({
      suggestions: [{
        type: 'SUBSTITUTION',
        urgency: 'high',
        playerIn: 'a-in', playerOut: 'a-out', position: 'M1',
      }],
      error: null,
    });

    let insertCount = 0;
    queryMock.mock.mockImplementation(async (sql) => {
      if (/INSERT INTO proactive_push_log/i.test(sql)) {
        insertCount += 1;
        return { rows: [{ id: `push-${insertCount}`, pushed_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    });

    await proactiveCoach.onEvent('g1', 'substitution');
    await proactiveCoach.onEvent('g1', 'substitution');

    // First pushes; second is blocked by the global cooldown (60s default)
    assert.equal(insertCount, 1);
    assert.equal(broadcastMock.mock.callCount(), 1);
    proactiveCoach.deregister('g1');
  });
});

// ─── acknowledge / dismiss ──────────────────────────────────────────────────

describe('proactiveCoach: acknowledge / dismiss', () => {
  test('acknowledge updates the row and returns it', async () => {
    queryMock.mock.mockImplementation(async (sql) => {
      if (/UPDATE proactive_push_log\s+SET acknowledged_at/i.test(sql)) {
        return {
          rows: [{
            id: 'push-1',
            game_id: 'g1',
            rec_type: 'SUBSTITUTION',
            acknowledged_at: new Date().toISOString(),
          }],
        };
      }
      return { rows: [] };
    });

    const row = await proactiveCoach.acknowledge('push-1');
    assert.ok(row);
    assert.equal(row.id, 'push-1');
    assert.ok(row.acknowledged_at);
  });

  test('acknowledge returns null when row is missing or already resolved', async () => {
    queryMock.mock.mockImplementation(async () => ({ rows: [] }));
    const row = await proactiveCoach.acknowledge('does-not-exist');
    assert.equal(row, null);
  });

  test('dismiss updates the row and extends the type cooldown', async () => {
    proactiveCoach.register('g1', { coachId: 'c1' });

    queryMock.mock.mockImplementation(async (sql) => {
      if (/UPDATE proactive_push_log\s+SET dismissed_at/i.test(sql)) {
        return {
          rows: [{
            id: 'push-1',
            game_id: 'g1',
            rec_type: 'SUBSTITUTION',
            dismissed_at: new Date().toISOString(),
          }],
        };
      }
      return { rows: [] };
    });

    const before = Date.now();
    const row = await proactiveCoach.dismiss('push-1');
    assert.ok(row);

    const state = pcInternal.schedulers.get('g1');
    assert.ok(state);
    // Dismiss should push the SUBSTITUTION type cooldown into the future.
    assert.ok(state.cooldowns.byType.SUBSTITUTION > before);

    proactiveCoach.deregister('g1');
  });

  test('acknowledge / dismiss with empty pushId returns null without querying', async () => {
    assert.equal(await proactiveCoach.acknowledge(''), null);
    assert.equal(await proactiveCoach.dismiss(null), null);
    assert.equal(queryMock.mock.callCount(), 0);
  });
});

// ─── Pure selection / cooldown logic (no mocks required) ────────────────────

describe('proactiveCoach: _pickWinner', () => {
  function freshState() {
    return {
      ctx: {},
      registeredAt: 0,
      evaluating: false,
      intervalId: null,
      cooldowns: { lastPushAt: 0, byType: {}, byAthlete: {} },
    };
  }

  test('filters out suggestions below the urgency floor', () => {
    const state = freshState();
    const winner = pcInternal._pickWinner(state, [
      { type: 'ALERT', urgency: 'low' },
    ]);
    assert.equal(winner, null); // default floor is 'medium'
  });

  test('returns the highest-urgency suggestion first', () => {
    const state = freshState();
    const winner = pcInternal._pickWinner(state, [
      { type: 'PLAYTIME_ANALYSIS', urgency: 'medium' },
      { type: 'SUBSTITUTION',      urgency: 'high', playerIn: 'x' },
    ]);
    assert.equal(winner.type, 'SUBSTITUTION');
  });

  test('skips a suggestion whose cooldown is still active', () => {
    const state = freshState();
    // Pretend we just pushed a SUBSTITUTION a moment ago.
    state.cooldowns.lastPushAt = Date.now();
    state.cooldowns.byType.SUBSTITUTION = Date.now();

    const winner = pcInternal._pickWinner(state, [
      { type: 'SUBSTITUTION', urgency: 'high', playerIn: 'x' },
    ]);
    assert.equal(winner, null);
  });
});
