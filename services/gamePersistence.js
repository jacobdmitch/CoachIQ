import { query } from './database.js';
import logger from './logger.js';

/**
 * Persist a game event to the game_events table.
 * Maps in-memory event types to the DB enum values.
 * Silently skips events that don't map to a DB event type (clock events, etc.)
 */
const EVENT_TYPE_MAP = {
  GOAL: 'goal',
  ASSIST: 'assist',
  SHOT: 'shot',
  SHOT_ON_GOAL: 'shot_on_goal',
  GROUND_BALL: 'ground_ball',
  TURNOVER: 'turnover',
  CAUSED_TURNOVER: 'caused_turnover',
  SAVE: 'save',
  PENALTY: 'penalty',
  SUBSTITUTION: 'sub_in', // We log sub_in for the player entering
  PLAYER_SUBBED_IN: 'sub_in',
  PLAYER_SUBBED_OUT: 'sub_out',
  FACEOFF_WIN: 'faceoff_win',
  FACEOFF_LOSS: 'faceoff_loss',
};

export async function persistGameEvent(gameId, event) {
  const dbType = EVENT_TYPE_MAP[event.type];
  if (!dbType) return; // Clock events, score updates, etc. don't go in game_events

  const athleteId = event.athleteId || event.playerIn || null;
  if (!athleteId) return;

  try {
    await query(
      `INSERT INTO game_events (game_id, athlete_id, event_type, period, game_clock_seconds, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        gameId,
        athleteId,
        dbType,
        event.period || 0,
        event.clockTime || null,
        event.reason || null,
      ]
    );
  } catch (err) {
    // Don't let persistence failures break the live game flow
    logger.error(`Failed to persist game event: ${err.message}`, { gameId, event });
  }
}

/**
 * Persist a substitution to the playtime_log table.
 * Called when a player is subbed out, recording their stint duration.
 */
export async function persistPlaytimeEntry(gameId, athleteId, period, enteredAtSeconds, exitedAtSeconds) {
  const minutesPlayed = Math.max(0, (exitedAtSeconds - enteredAtSeconds) / 60);

  try {
    await query(
      `INSERT INTO playtime_log (game_id, athlete_id, period, minutes_played, entered_at_seconds, exited_at_seconds)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [gameId, athleteId, period, minutesPlayed.toFixed(2), enteredAtSeconds, exitedAtSeconds]
    );
  } catch (err) {
    logger.error(`Failed to persist playtime entry: ${err.message}`, { gameId, athleteId });
  }
}

/**
 * Save a snapshot of the current game state to game_sessions (JSONB).
 * Creates or updates the session row so state can be recovered on restart.
 */
export async function saveGameStateSnapshot(gameId, coachId, gameState) {
  try {
    const stateJson = JSON.stringify(gameState.getState());

    // Upsert: try update first, insert if no row exists
    const updated = await query(
      `UPDATE game_sessions SET game_state = $1, updated_at = NOW()
       WHERE game_id = $2 AND status = 'active'
       RETURNING id`,
      [stateJson, gameId]
    );

    if (updated.rows.length === 0) {
      // Generate a 6-char join code
      const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      await query(
        `INSERT INTO game_sessions (game_id, join_code, head_coach_id, format, game_state)
         VALUES ($1, $2, $3, $4, $5)`,
        [gameId, joinCode, coachId, gameState.format, stateJson]
      );
    }
  } catch (err) {
    logger.error(`Failed to save game state snapshot: ${err.message}`, { gameId });
  }
}

/**
 * Load a game state snapshot from the database (for recovery after restart).
 * Returns the parsed JSONB state or null if no active session exists.
 */
export async function loadGameStateSnapshot(gameId) {
  try {
    const result = await query(
      `SELECT game_state FROM game_sessions
       WHERE game_id = $1 AND status = 'active'
       ORDER BY updated_at DESC LIMIT 1`,
      [gameId]
    );

    if (result.rows.length === 0 || !result.rows[0].game_state) {
      return null;
    }

    return result.rows[0].game_state;
  } catch (err) {
    logger.error(`Failed to load game state snapshot: ${err.message}`, { gameId });
    return null;
  }
}
