/**
 * liveGameStore.js
 *
 * Single shared store for in-memory live game state.
 * Imported by both game-live.js and ai-coach.js so that AI recommendations
 * have access to the same live field positions and playtime data that the
 * game controller maintains.
 *
 * In a multi-instance production deployment, replace these Maps with Redis.
 */

/** @type {Map<string, import('./gameStateManager.js').GameStateManager>} */
const gameStates = new Map();

/** @type {Map<string, import('./playtimeTracker.js').PlaytimeTracker>} */
const playtimeTrackers = new Map();

/** @type {Map<string, NodeJS.Timeout>} */
const clockIntervals = new Map();

export { gameStates, playtimeTrackers, clockIntervals };
