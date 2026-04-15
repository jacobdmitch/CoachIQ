/**
 * Weekly AI Usage Summary Job
 *
 * Runs every Monday via Render cron. Aggregates AI call logs per coach
 * for the previous 7 days and logs a summary. This data will feed into
 * billing and usage dashboards once those are implemented.
 *
 * Current behavior: logs to stdout (visible in Render logs).
 * Future: write to a usage_summaries table, send email alerts for
 * coaches exceeding usage thresholds.
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
    console.log('[weeklyAiUsage] Generating weekly AI usage summary...');

    const result = await client.query(`
      SELECT
        c.id AS coach_id,
        c.email,
        c.subscription_tier,
        COUNT(a.id) AS total_calls,
        COALESCE(SUM(a.input_tokens), 0) AS total_input_tokens,
        COALESCE(SUM(a.output_tokens), 0) AS total_output_tokens,
        COALESCE(SUM(a.cost_estimate), 0)::NUMERIC(10,4) AS total_cost,
        COALESCE(AVG(a.latency_ms), 0)::INTEGER AS avg_latency_ms
      FROM coaches c
      LEFT JOIN ai_call_logs a
        ON a.coach_id = c.id
        AND a.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY c.id, c.email, c.subscription_tier
      HAVING COUNT(a.id) > 0
      ORDER BY total_cost DESC
    `);

    if (result.rows.length === 0) {
      console.log('[weeklyAiUsage] No AI usage in the past 7 days.');
    } else {
      console.log(`[weeklyAiUsage] ${result.rows.length} coaches used AI this week:`);
      let totalPlatformCost = 0;

      for (const row of result.rows) {
        totalPlatformCost += parseFloat(row.total_cost);
        console.log(
          `  ${row.email} (${row.subscription_tier}): ` +
          `${row.total_calls} calls, ` +
          `${row.total_input_tokens + row.total_output_tokens} tokens, ` +
          `$${row.total_cost} est. cost, ` +
          `${row.avg_latency_ms}ms avg latency`
        );
      }

      console.log(`[weeklyAiUsage] Total platform AI cost this week: $${totalPlatformCost.toFixed(4)}`);
    }

    console.log('[weeklyAiUsage] Summary complete.');
  } catch (err) {
    console.error('[weeklyAiUsage] Error:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
