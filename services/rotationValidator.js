/**
 * rotationValidator — pure input-shape validation for line rotations.
 *
 * Kept framework-free so it can be unit-tested without importing express
 * or the request middleware. Callers translate the returned error into
 * whatever error type they use (AppError in routes).
 *
 * Database-level validation (lines belong to the given team + group) lives
 * in the route because it requires a DB query.
 */

const VALID_POSITION_GROUPS = ['attack', 'midfield', 'defense'];
const MIN_LINES_PER_ROTATION = 2;

/**
 * Validate the shape of a rotation create/update body.
 *
 * @param {object} input
 * @param {string} input.name
 * @param {string} input.positionGroup
 * @param {string[]} input.lineIds
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateRotationInput({ name, positionGroup, lineIds }) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    return { ok: false, error: 'name is required' };
  }
  if (!positionGroup || !VALID_POSITION_GROUPS.includes(positionGroup)) {
    return { ok: false, error: 'positionGroup must be attack, midfield, or defense' };
  }
  if (!Array.isArray(lineIds)) {
    return { ok: false, error: 'lineIds must be an array' };
  }
  if (lineIds.length < MIN_LINES_PER_ROTATION) {
    return { ok: false, error: 'A rotation needs at least two lines' };
  }
  for (const id of lineIds) {
    if (typeof id !== 'string' || id.length === 0) {
      return { ok: false, error: 'lineIds must contain non-empty strings' };
    }
  }
  return { ok: true };
}

/**
 * Advance a rotation cursor by one slot, wrapping at the end.
 * Pure; mirrors the per-game client logic in StagingPanel so tests can
 * guard against off-by-one regressions.
 *
 * @param {number} currentIndex
 * @param {number} length
 * @returns {number} next index
 */
export function advanceRotationCursor(currentIndex, length) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('length must be a positive integer');
  }
  if (!Number.isInteger(currentIndex) || currentIndex < 0) {
    return 0;
  }
  return (currentIndex + 1) % length;
}
