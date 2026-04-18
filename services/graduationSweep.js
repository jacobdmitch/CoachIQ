/**
 * Graduation sweep
 *
 * Runs on server boot and every 24h thereafter. Deactivates athletes whose
 * graduation date has passed so coaches don't have to manually archive them
 * each year.
 *
 * Graduation date:
 *   - If graduation_month is set → last day of (graduation_year, graduation_month)
 *   - Otherwise                  → June 30 of graduation_year (HS default)
 *
 * An athlete is deactivated when CURRENT_DATE is strictly greater than the
 * graduation date, so an athlete graduating today still counts as active.
 */

import { query } from './database.js';
import logger from './logger.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function runGraduationSweep() {
  try {
    const { rowCount } = await query(`
      UPDATE athletes
         SET status = 'inactive', updated_at = NOW()
       WHERE status = 'active'
         AND graduation_year IS NOT NULL
         AND CURRENT_DATE > (
           CASE
             WHEN graduation_month IS NOT NULL
               THEN (make_date(graduation_year, graduation_month::int, 1)
                     + INTERVAL '1 month' - INTERVAL '1 day')::date
             ELSE make_date(graduation_year, 6, 30)
           END
         )
    `);
    if (rowCount > 0) {
      logger.info(`[graduationSweep] Deactivated ${rowCount} graduated athletes`);
    }
    return rowCount;
  } catch (err) {
    logger.error(`[graduationSweep] Error: ${err.message}`);
    return 0;
  }
}

export function scheduleGraduationSweep() {
  // Fire once at boot, then once per day. unref() so the timer doesn't block
  // process exit during tests or graceful shutdown.
  runGraduationSweep();
  const handle = setInterval(runGraduationSweep, ONE_DAY_MS);
  if (handle.unref) handle.unref();
  return handle;
}
