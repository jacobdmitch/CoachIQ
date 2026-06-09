/**
 * localDb.js — on-device persistence for standalone (no-backend) mode.
 *
 * The whole dataset for one coach is small (a roster, a season of games, plays,
 * practices), so rather than a relational store we keep a single JSON document
 * in IndexedDB with an in-memory mirror. Reads are synchronous against the
 * mirror; writes mutate the mirror and debounce-persist the whole document.
 *
 * Collections mirror the backend's table names so the local API router
 * (localBackend.js) can return the same shapes the screens already expect.
 */

import { seedDatabase } from './seed';

const DB_NAME = 'coachiq_local';
const DB_VERSION = 1;
const STORE = 'kv';
const DOC_KEY = 'db';

const EMPTY = () => ({
  meta: { version: 1, createdAt: new Date().toISOString() },
  coach: null,
  settings: {},
  teams: [],
  seasons: [],
  athletes: [],
  parent_contacts: [],
  games: [],
  game_events: [],
  playtime_log: [],
  plays: [],
  practice_sessions: [],
  lines: [],
  line_rotations: [],
  opposing_teams: [],
  opposing_players: [],
  opposing_player_film_stats: [],
  situation_assignments: [],
  share_tokens: [],
  ai_call_logs: [],
  proactive_pushes: [],
  live_games: {}, // gameId -> persisted live snapshot { snapshot, playtime, seqNo }
});

let cache = null;
let dbPromise = null;
let readyPromise = null;
let saveTimer = null;

// ─── uuid ─────────────────────────────────────────────────────────────────────
export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function nowISO() {
  return new Date().toISOString();
}

// ─── IndexedDB plumbing ─────────────────────────────────────────────────────────
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function readDoc() {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(DOC_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })
  );
}

function writeDoc(doc) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(doc, DOC_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

/**
 * Load the document (seeding on first run). Idempotent — returns the same
 * promise on repeat calls.
 */
export function ready() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    let doc = null;
    try {
      doc = await readDoc();
    } catch {
      doc = null;
    }
    if (!doc) {
      cache = EMPTY();
      seedDatabase(cache); // populate demo team/roster/etc.
      await persistNow();
    } else {
      cache = { ...EMPTY(), ...doc };
    }
    return cache;
  })();
  return readyPromise;
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow().catch(() => {});
  }, 150);
}

export function persistNow() {
  if (!cache) return Promise.resolve();
  // Structured clone via JSON keeps the persisted copy detached from the mirror.
  return writeDoc(JSON.parse(JSON.stringify(cache)));
}

// ─── Collection helpers (operate on the in-memory mirror) ───────────────────────
export function db() {
  if (!cache) throw new Error('localDb not ready — await ready() first');
  return cache;
}

export function all(collection) {
  return db()[collection] || [];
}

export function find(collection, pred) {
  return all(collection).filter(pred);
}

export function findOne(collection, pred) {
  return all(collection).find(pred) || null;
}

export function getById(collection, id) {
  return all(collection).find((r) => r.id === id) || null;
}

export function insert(collection, row) {
  db()[collection].push(row);
  scheduleSave();
  return row;
}

export function update(collection, id, patch) {
  const row = getById(collection, id);
  if (!row) return null;
  Object.assign(row, patch, { updated_at: nowISO() });
  scheduleSave();
  return row;
}

export function remove(collection, id) {
  const arr = db()[collection];
  const i = arr.findIndex((r) => r.id === id);
  if (i >= 0) {
    arr.splice(i, 1);
    scheduleSave();
    return true;
  }
  return false;
}

/** Replace/patch a keyed sub-object (used for live_games and settings). */
export function setKey(collection, key, value) {
  db()[collection][key] = value;
  scheduleSave();
  return value;
}

export function patchSettings(patch) {
  Object.assign(db().settings, patch);
  scheduleSave();
  return db().settings;
}

export default {
  ready,
  db,
  all,
  find,
  findOne,
  getById,
  insert,
  update,
  remove,
  setKey,
  patchSettings,
  persistNow,
  uuid,
  nowISO,
};
