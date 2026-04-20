/**
 * Unit tests for SyncClient — the offline-aware coordinator that queues
 * mutations when the network drops and replays them in order on reconnect.
 *
 * Three behaviors matter most for coach trust during a game:
 *   1. Network error on send() enqueues the mutation without throwing.
 *   2. drain() replays the queue in FIFO order so events land in the
 *      order they were captured.
 *   3. The pre-assigned idempotencyKey is carried end-to-end so the
 *      server's withIdempotency layer dedupes replays.
 *
 * offlineQueue is mocked as an in-memory FIFO array — the real module
 * wraps IndexedDB, which jsdom doesn't ship. That also lets us assert
 * directly on enqueue order.
 */

// Jest via react-scripts runs with resetMocks: true, which wipes mock
// implementations between tests. So the mock factory installs the jest.fn
// stubs, and beforeEach rebinds the implementations against a fresh
// in-memory queue/counter defined at module scope.
jest.mock('../offlineQueue', () => ({
  __esModule: true,
  enqueue:           jest.fn(),
  listPending:       jest.fn(),
  removePending:     jest.fn(),
  newIdempotencyKey: jest.fn(),
}));

import { SyncClient } from '../syncClient';
import * as offlineQueue from '../offlineQueue';

let queue;
let counter;

function wireOfflineQueue() {
  queue = [];
  counter = 0;
  offlineQueue.enqueue.mockImplementation(async (op) => {
    queue.push({ ...op, id: ++counter });
  });
  offlineQueue.listPending.mockImplementation(async (gameId) =>
    queue.filter((o) => o.gameId === gameId).slice()
  );
  offlineQueue.removePending.mockImplementation(async (id) => {
    const i = queue.findIndex((o) => o.id === id);
    if (i >= 0) queue.splice(i, 1);
  });
  offlineQueue.newIdempotencyKey.mockImplementation(() => `idem-${++counter}`);
}

const GAME_ID = 'game-1';

function makeApiClient() {
  return {
    post:   jest.fn(),
    delete: jest.fn(),
    get:    jest.fn().mockResolvedValue({ data: { snapshot: null } }),
  };
}

function makeCallbacks() {
  return {
    onOnline:      jest.fn(),
    onOffline:     jest.fn(),
    onQueueChange: jest.fn(),
    onReconcile:   jest.fn(),
    onError:       jest.fn(),
  };
}

beforeEach(() => {
  // react-scripts sets resetMocks: true, which wipes mock implementations
  // between tests. Rebind them against a fresh queue/counter every test.
  wireOfflineQueue();
});

describe('SyncClient.send — idempotency key propagation', () => {
  test('online send injects idempotencyKey + clientTimestamp into the body', async () => {
    const apiClient = makeApiClient();
    apiClient.post.mockResolvedValueOnce({ data: { success: true } });
    const client = new SyncClient({ gameId: GAME_ID, apiClient, ...makeCallbacks() });
    client.online = true;

    const { queued, response } = await client.send(
      'POST',
      `/game-live/${GAME_ID}/event`,
      { eventType: 'GOAL', athleteId: 'a1' }
    );

    expect(queued).toBe(false);
    expect(response).toEqual({ success: true });
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [, body] = apiClient.post.mock.calls[0];
    expect(body).toMatchObject({
      eventType: 'GOAL',
      athleteId: 'a1',
    });
    expect(typeof body.idempotencyKey).toBe('string');
    expect(body.idempotencyKey).toMatch(/^idem-/);
    expect(typeof body.clientTimestamp).toBe('number');
  });

  test('DELETE requests carry the idempotencyKey as an x-idempotency-key header', async () => {
    const apiClient = makeApiClient();
    apiClient.delete.mockResolvedValueOnce({ data: { success: true } });
    const client = new SyncClient({ gameId: GAME_ID, apiClient, ...makeCallbacks() });
    client.online = true;

    await client.send('DELETE', `/game-live/${GAME_ID}/sub-queue/q1`, null);

    expect(apiClient.delete).toHaveBeenCalledTimes(1);
    const [, config] = apiClient.delete.mock.calls[0];
    expect(config.headers['x-idempotency-key']).toMatch(/^idem-/);
  });
});

describe('SyncClient.send — queue on network error', () => {
  test('POST that throws a network error enqueues and returns { queued: true }', async () => {
    const apiClient = makeApiClient();
    apiClient.post.mockRejectedValueOnce({ message: 'Network Error' });
    const cb = makeCallbacks();
    const client = new SyncClient({ gameId: GAME_ID, apiClient, ...cb });
    client.online = true;

    const result = await client.send(
      'POST',
      `/game-live/${GAME_ID}/event`,
      { eventType: 'GOAL', athleteId: 'a1' }
    );

    expect(result).toEqual({ queued: true });
    expect(offlineQueue.enqueue).toHaveBeenCalledTimes(1);
    const enqueued = offlineQueue.enqueue.mock.calls[0][0];
    expect(enqueued.method).toBe('POST');
    expect(enqueued.path).toBe(`/game-live/${GAME_ID}/event`);
    expect(enqueued.idempotencyKey).toMatch(/^idem-/);
    expect(cb.onOffline).toHaveBeenCalledTimes(1);
  });

  test('send() while already offline enqueues without hitting the network', async () => {
    const apiClient = makeApiClient();
    const client = new SyncClient({ gameId: GAME_ID, apiClient, ...makeCallbacks() });
    client.online = false;

    const result = await client.send('POST', `/game-live/${GAME_ID}/event`, { eventType: 'SAVE', athleteId: 'a1' });

    expect(result).toEqual({ queued: true });
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(offlineQueue.enqueue).toHaveBeenCalledTimes(1);
  });

  test('non-network error (4xx) is thrown, not queued', async () => {
    const apiClient = makeApiClient();
    apiClient.post.mockRejectedValueOnce({
      response: { status: 400, data: { error: 'bad input' } },
      message: 'Request failed with status code 400',
    });
    const client = new SyncClient({ gameId: GAME_ID, apiClient, ...makeCallbacks() });
    client.online = true;

    await expect(
      client.send('POST', `/game-live/${GAME_ID}/event`, { eventType: 'GOAL', athleteId: 'a1' })
    ).rejects.toBeTruthy();

    expect(offlineQueue.enqueue).not.toHaveBeenCalled();
  });
});

describe('SyncClient.drain — replay order and idempotency', () => {
  test('replays queued ops in FIFO order with their original idempotencyKey', async () => {
    const apiClient = makeApiClient();
    apiClient.post.mockResolvedValue({ data: { success: true } });
    const client = new SyncClient({ gameId: GAME_ID, apiClient, ...makeCallbacks() });
    client.online = false;

    // Stage three offline sends while offline.
    await client.send('POST', `/game-live/${GAME_ID}/event`, { eventType: 'GOAL',         athleteId: 'a1' });
    await client.send('POST', `/game-live/${GAME_ID}/event`, { eventType: 'ASSIST',       athleteId: 'a2' });
    await client.send('POST', `/game-live/${GAME_ID}/event`, { eventType: 'GROUND_BALL',  athleteId: 'a3' });

    expect(apiClient.post).not.toHaveBeenCalled();
    client.online = true;

    await client.drain();

    // All three replayed in original order.
    expect(apiClient.post).toHaveBeenCalledTimes(3);
    const sentTypes = apiClient.post.mock.calls.map(([, body]) => body.eventType);
    expect(sentTypes).toEqual(['GOAL', 'ASSIST', 'GROUND_BALL']);

    // Each replay carries the key it was originally enqueued with.
    const enqueuedKeys = offlineQueue.enqueue.mock.calls.map((c) => c[0].idempotencyKey);
    const sentKeys     = apiClient.post.mock.calls.map(([, body]) => body.idempotencyKey);
    expect(sentKeys).toEqual(enqueuedKeys);
  });

  test('drain stops on first network error and stays offline', async () => {
    const apiClient = makeApiClient();
    apiClient.post
      .mockResolvedValueOnce({ data: { success: true } })      // op 1 succeeds
      .mockRejectedValueOnce({ message: 'Network Error' });    // op 2 drops net
    const cb = makeCallbacks();
    const client = new SyncClient({ gameId: GAME_ID, apiClient, ...cb });
    client.online = false;

    await client.send('POST', `/game-live/${GAME_ID}/event`, { eventType: 'GOAL',   athleteId: 'a1' });
    await client.send('POST', `/game-live/${GAME_ID}/event`, { eventType: 'ASSIST', athleteId: 'a2' });
    await client.send('POST', `/game-live/${GAME_ID}/event`, { eventType: 'SHOT',   athleteId: 'a3' });

    client.online = true;
    await client.drain();

    // Op 1 succeeded, op 2 failed — op 3 should not have been attempted.
    expect(apiClient.post).toHaveBeenCalledTimes(2);
    expect(cb.onOffline).toHaveBeenCalled();

    // The remaining two ops are still in the queue for a later drain.
    const still = await offlineQueue.listPending(GAME_ID);
    expect(still.length).toBe(2);
  });

  test('drain drops 4xx ops and surfaces the error so the UI can toast', async () => {
    const apiClient = makeApiClient();
    apiClient.post.mockRejectedValueOnce({
      response: { status: 403 },
      message:  'Request failed with status code 403',
    });
    const cb = makeCallbacks();
    const client = new SyncClient({ gameId: GAME_ID, apiClient, ...cb });
    client.online = false;

    await client.send('POST', `/game-live/${GAME_ID}/event`, { eventType: 'GOAL', athleteId: 'a1' });

    client.online = true;
    await client.drain();

    expect(cb.onError).toHaveBeenCalledTimes(1);
    const still = await offlineQueue.listPending(GAME_ID);
    expect(still.length).toBe(0);  // op was dropped after the 403
  });
});
