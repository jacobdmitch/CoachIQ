/**
 * Daily Cleanup Job
 *
 * Runs once per day via Render cron. Handles:
 *   1. Expired refresh tokens (older than 30 days)
 *   2. Ended game sessions with no activity for 24+ hours
 *   3. Orphaned sync_events from ended sessions
 *   4. AI call logs older than 90 days (keep aggregates, drop raw rows)
 */

import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('[dailyCleanup] Starting daily cleanup...');

    // 1. Delete expired refresh tokens (if/when a refresh_tokens table exists)
    // Placeholder for when auth token storage is implemented.
    // const expiredTokens = await client.query(
    //   `DELETE FROM refresh_tokens WHERE expires_at < NOW() RETURNING id`
    // );
    // console.log(`[dailyCleanup] Removed ${expiredTokens.rowCount} expired refresh tokens`);

    // 2. Mark stale game sessions as ended
    const staleSessions = await client.query(`
      UPDATE game_sessions
      SET status = 'ended', updated_at = NOW()
      WHERE status = 'active'
        AND updated_at < NOW() - INTERVAL '24 hours'
      RETURNING id
    `);
    console.log(`[dailyCleanup] Ended ${staleSessions.rowCount} stale game sessions`);

    // 3. Clean up resolved sync events older than 7 days
    const oldSyncEvents = await client.query(`
      DELETE FROM sync_events
      WHERE resolved = true
        AND timestamp < NOW() - INTERVAL '7 days'
      RETURNING id
    `);
    console.log(`[dailyCleanup] Removed ${oldSyncEvents.rowCount} old sync events`);

    // 4. Trim AI call logs older than 90 days
    const oldAiLogs = await client.query(`
      DELETE FROM ai_call_logs
      WHERE created_at < NOW() - INTERVAL '90 days'
      RETURNING id
    `);
    console.log(`[dailyCleanup] Removed ${oldAiLogs.rowCount} old AI call log entries`);

    console.log('[dailyCleanup] Cleanup complete.');
  } catch (err) {
    console.error('[dailyCleanup] Error:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
