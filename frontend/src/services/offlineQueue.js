/**
 * offlineQueue.js — IndexedDB-backed FIFO queue for pending game mutations.
 *
 * Every mutation queued here carries a pre-generated idempotencyKey (UUIDv4)
 * and a clientTimestamp. On reconnect the sync client drains the queue in
 * insertion order, POSTing each operation to its REST endpoint. The server's
 * withIdempotency layer guarantees replay-safety: a second call with the same
 * key returns the original response without re-executing.
 *
 * Schema:
 *   store: pending_ops
 *     keyPath: id (auto-increment; preserves FIFO order)
 *     fields: {
 *       idempotencyKey, clientTimestamp, gameId,
 *       method, path, body, enqueuedAt
 *     }
 *
 * Scope: one database shared across games. Entries are scoped by gameId so
 * the sync client can drain per-game.
 */

const DB_NAME    = 'coachiq_offline';
const DB_VERSION = 1;
const STORE      = 'pending_ops';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('gameId', 'gameId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * UUIDv4 generator. Uses crypto.randomUUID when available, falls back to
 * a manual RFC-4122 v4 implementation for older browsers.
 */
export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

/**
 * Enqueue a pending mutation. Returns the auto-incremented id.
 */
export async function enqueue({ idempotencyKey, clientTimestamp, gameId, method, path, body }) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.add({
      idempotencyKey,
      clientTimestamp,
      gameId,
      method,
      path,
      body,
      enqueuedAt: Date.now(),
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * List pending operations for a game, in insertion order.
 */
export async function listPending(gameId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const results = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return resolve(results);
      if (!gameId || cursor.value.gameId === gameId) results.push(cursor.value);
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/**
 * Remove a pending op by id. Called after a successful replay.
 */
export async function removePending(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * Count pending ops for a game (or all games if gameId omitted). Used by
 * the UI to show a "N queued" badge.
 */
export async function countPending(gameId) {
  const ops = await listPending(gameId);
  return ops.length;
}

/**
 * Drop all pending ops for a game. Used when the game ends so stale entries
 * don't linger across sessions.
 */
export async function clearGame(gameId) {
  const ops = await listPending(gameId);
  await Promise.all(ops.map(op => removePending(op.id)));
}
