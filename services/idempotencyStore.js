import { query } from './database.js';
import logger from './logger.js';

/**
 * Idempotency store — caches mutation responses by a client-generated key so
 * a retried call (after a network blip or offline replay) returns the
 * original result instead of double-applying the mutation.
 *
 * How it's used:
 *   1. Client generates a UUIDv4 before calling any mutation endpoint.
 *   2. Endpoint checks the store at the top of the handler. If a record
 *      exists for that key, it short-circuits with the cached JSON response.
 *   3. Otherwise it runs the mutation as normal, then writes the response
 *      body to the store before returning.
 *
 * Records are keyed on (idempotency_key) alone — the client is responsible
 * for making each logical action unique. Scoping to game_id + operation
 * would prevent cross-game collisions but isn't necessary when the key is
 * a v4 UUID.
 *
 * Retention: rows accumulate quickly in a long game. A daily cron should
 * prune records older than 24h. Not implemented here — added to the backlog
 * so we don't delete records that might still be replayed after a reconnect.
 */

/**
 * Look up a previously-stored response for this idempotency key.
 * Returns the JSON response body the endpoint originally returned, or null.
 */
export async function getIdempotentResponse(key) {
  if (!key) return null;
  try {
    const result = await query(
      `SELECT response_json FROM idempotency_records WHERE idempotency_key = $1`,
      [key]
    );
    return result.rows[0]?.response_json ?? null;
  } catch (err) {
    // If the lookup fails, log and return null — the worst case is we
    // re-execute the mutation, which is the same state the server was in
    // before the idempotency layer existed.
    logger.warn(`Idempotency lookup failed for key ${key}: ${err.message}`);
    return null;
  }
}

/**
 * Persist a response so subsequent calls with the same key short-circuit.
 * Uses ON CONFLICT DO NOTHING — concurrent duplicate requests should both
 * succeed at the mutation level; whichever gets the unique constraint first
 * "wins" the record, and the other's save is a no-op.
 */
export async function saveIdempotentResponse(key, { gameId, coachId, operation, response }) {
  if (!key) return;
  try {
    await query(
      `INSERT INTO idempotency_records (idempotency_key, game_id, coach_id, operation, response_json)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [key, gameId || null, coachId || null, operation, JSON.stringify(response)]
    );
  } catch (err) {
    logger.warn(`Idempotency save failed for key ${key}: ${err.message}`);
  }
}

/**
 * Convenience wrapper: run the handler only if we have no cached response
 * for this key. Returns `{ cached, response }` — if `cached` is true, the
 * caller should return the cached response and skip the mutation entirely.
 *
 *   const { cached, response } = await withIdempotency(key, async () => {
 *     // ... mutation work ...
 *     return { success: true, ... };
 *   }, { gameId, coachId, operation });
 *   if (cached) return res.json(response);
 *   // continue with fresh response
 *
 * When key is null/undefined, the wrapper just runs the handler and returns
 * its result without storing anything. That keeps legacy (pre-offline)
 * callers working unchanged.
 */
export async function withIdempotency(key, handler, { gameId, coachId, operation }) {
  if (key) {
    const cached = await getIdempotentResponse(key);
    if (cached) return { cached: true, response: cached };
  }

  const response = await handler();
  if (key) {
    await saveIdempotentResponse(key, { gameId, coachId, operation, response });
  }
  return { cached: false, response };
}
