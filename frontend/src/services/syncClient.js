/**
 * syncClient.js — coordinates online/offline behavior for a live game.
 *
 * Responsibilities:
 *   1. Detect connectivity via navigator.onLine + periodic ping to /health.
 *   2. Drain the offline queue in FIFO order on reconnect. Each replay uses
 *      the pre-assigned idempotencyKey so the server dedupes via
 *      withIdempotency.
 *   3. After the queue is drained, GET /game-live/:gameId/events-since/:seqNo
 *      to pick up any mutations other coaches made while we were offline.
 *      The returned snapshot replaces the local state.
 *
 * Usage is callback-oriented so React hooks can subscribe:
 *
 *   const sync = new SyncClient({
 *     gameId, apiClient,
 *     onOnline, onOffline, onQueueChange, onReconcile, onError,
 *   });
 *   sync.start();
 *   ...
 *   sync.stop();
 */

import { enqueue, listPending, removePending, newIdempotencyKey } from './offlineQueue';

const PING_INTERVAL_MS = 15_000;
const PING_TIMEOUT_MS  = 4_000;

export class SyncClient {
  constructor({
    gameId,
    apiClient,
    localMode = false,
    onOnline = () => {},
    onOffline = () => {},
    onQueueChange = () => {},
    onReconcile = () => {},
    onError = () => {},
  }) {
    this.gameId = gameId;
    this.apiClient = apiClient;
    this.localMode = localMode;
    this.callbacks = { onOnline, onOffline, onQueueChange, onReconcile, onError };

    // Standalone mode: the on-device backend is always reachable, so we're
    // permanently "online" and mutations go straight through (never queued).
    this.online = localMode ? true : (typeof navigator !== 'undefined' ? navigator.onLine : true);
    this.draining = false;
    this.pingTimer = null;
    this.latestSeqNo = 0;

    this._handleOnline  = this._handleOnline.bind(this);
    this._handleOffline = this._handleOffline.bind(this);
  }

  start() {
    // Standalone mode: no connectivity detection or heartbeat — just reconcile
    // once from the on-device backend.
    if (this.localMode) {
      this.drain().catch(err => this.callbacks.onError(err));
      return;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online',  this._handleOnline);
      window.addEventListener('offline', this._handleOffline);
    }
    this.pingTimer = setInterval(() => this._heartbeat(), PING_INTERVAL_MS);
    // Kick off an immediate drain if we're online and have queued items.
    if (this.online) this.drain().catch(err => this.callbacks.onError(err));
  }

  stop() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online',  this._handleOnline);
      window.removeEventListener('offline', this._handleOffline);
    }
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** Update the latest server seq_no we've seen, used for reconcile. */
  setLatestSeqNo(seqNo) {
    if (typeof seqNo === 'number' && seqNo > this.latestSeqNo) {
      this.latestSeqNo = seqNo;
    }
  }

  /**
   * Queue or send a mutation. When online, it goes straight to the server
   * and the caller gets the server response. When offline, it's persisted
   * to IndexedDB and resolves with { queued: true }. Either way the
   * idempotencyKey is preserved so a replay is safe.
   *
   * @param {'POST'|'DELETE'} method
   * @param {string} path - full path under the api base, e.g. `/game-live/${gameId}/event`
   * @param {Object|null} body
   * @returns {Promise<{ queued: boolean, response?: any }>}
   */
  async send(method, path, body) {
    const idempotencyKey  = newIdempotencyKey();
    const clientTimestamp = Date.now();
    const payload = body ? { ...body, idempotencyKey, clientTimestamp } : null;

    if (this.online) {
      try {
        const response = await this._perform(method, path, payload, idempotencyKey);
        return { queued: false, response };
      } catch (err) {
        // Network errors drop us offline — queue and report.
        if (this._isNetworkError(err)) {
          await this._enqueue({ idempotencyKey, clientTimestamp, method, path, body: payload });
          this._markOffline();
          return { queued: true };
        }
        throw err;
      }
    }

    await this._enqueue({ idempotencyKey, clientTimestamp, method, path, body: payload });
    return { queued: true };
  }

  /**
   * Drain the queue. Stops on the first failure (keeps FIFO ordering so a
   * partial failure doesn't reorder events). Called automatically on
   * reconnect and immediately on start().
   */
  async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      const ops = await listPending(this.gameId);
      for (const op of ops) {
        try {
          await this._perform(op.method, op.path, op.body, op.idempotencyKey);
          await removePending(op.id);
          this.callbacks.onQueueChange(await listPending(this.gameId));
        } catch (err) {
          if (this._isNetworkError(err)) {
            // Still offline — give up for now.
            this._markOffline();
            return;
          }
          // Non-network failure (e.g. 400/403). The op will never succeed as
          // written; drop it and surface the error so the UI can toast.
          await removePending(op.id);
          this.callbacks.onError(err);
          this.callbacks.onQueueChange(await listPending(this.gameId));
        }
      }
      // Queue drained — reconcile with the server.
      await this.reconcile();
    } finally {
      this.draining = false;
    }
  }

  /**
   * Pull events since the last known seq_no and replace the local snapshot
   * with the server's authoritative state. Called after the queue drains.
   */
  async reconcile() {
    try {
      const { data } = await this.apiClient.get(
        `/game-live/${this.gameId}/events-since/${this.latestSeqNo}`
      );
      if (data?.snapshot) {
        if (typeof data.latestSeqNo === 'number') this.latestSeqNo = data.latestSeqNo;
        this.callbacks.onReconcile({
          snapshot:     data.snapshot,
          events:       data.events || [],
          latestSeqNo:  data.latestSeqNo,
        });
      }
    } catch (err) {
      if (this._isNetworkError(err)) this._markOffline();
      else this.callbacks.onError(err);
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  async _enqueue(op) {
    await enqueue({ ...op, gameId: this.gameId });
    this.callbacks.onQueueChange(await listPending(this.gameId));
  }

  async _perform(method, path, body, idempotencyKey) {
    const config = method === 'DELETE' && idempotencyKey
      ? { headers: { 'x-idempotency-key': idempotencyKey } }
      : undefined;
    if (method === 'POST')   return (await this.apiClient.post(path, body || {}, config)).data;
    if (method === 'DELETE') return (await this.apiClient.delete(path, config)).data;
    throw new Error(`Unsupported method: ${method}`);
  }

  _isNetworkError(err) {
    // Axios surfaces no `response` for network failures. Also catch timeouts.
    return !err.response || err.code === 'ECONNABORTED' || err.message === 'Network Error';
  }

  async _heartbeat() {
    // Cheap GET to verify we actually have a working connection — navigator.onLine
    // lies on captive-portal wifi. /health lives at the server root (not under
    // /api), so we use fetch directly rather than the /api-scoped axios client.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    try {
      const res = await fetch('/health', { signal: controller.signal, cache: 'no-store' });
      if (res.ok) {
        if (!this.online) this._markOnline();
      } else if (this.online) {
        this._markOffline();
      }
    } catch {
      if (this.online) this._markOffline();
    } finally {
      clearTimeout(timer);
    }
  }

  _handleOnline()  { this._markOnline();  }
  _handleOffline() { this._markOffline(); }

  _markOnline() {
    if (this.online) return;
    this.online = true;
    this.callbacks.onOnline();
    this.drain().catch(err => this.callbacks.onError(err));
  }

  _markOffline() {
    if (!this.online) return;
    this.online = false;
    this.callbacks.onOffline();
  }
}

export default SyncClient;
