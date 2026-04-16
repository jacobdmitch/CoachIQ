/**
 * Shared formatting utilities — use browser locale (undefined) everywhere
 * so dates/times render in the user's OS-configured format (12h/24h, regional separators, etc.)
 */

/**
 * Format a date (and optional time) string for display.
 *
 * @param {string} dateStr  — ISO date string or YYYY-MM-DD (e.g. "2025-04-15" or "2025-04-15T00:00:00.000Z")
 * @param {string} timeStr  — HH:MM time string from a TIME column, or null/undefined
 * @param {object} dateOpts — Intl.DateTimeFormat options for the date portion
 * @returns {string}
 */
export function formatDateTime(dateStr, timeStr, dateOpts = {}) {
  if (!dateStr) return '';

  // Strip the time component from ISO strings before constructing a local date,
  // otherwise "2025-04-15T00:00:00.000Z" parses as UTC and can shift the day.
  const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const base = new Date(`${dateOnly}T00:00:00`);

  if (timeStr) {
    // Combine date + time for a locale-aware full datetime string
    const [hours, minutes] = timeStr.split(':').map(Number);
    base.setHours(hours, minutes, 0, 0);
    return base.toLocaleString(undefined, {
      ...dateOpts,
      hour:   '2-digit',
      minute: '2-digit',
    });
  }

  return base.toLocaleDateString(undefined, dateOpts);
}

/**
 * Convert snake_case tag strings to Title Case for display.
 * e.g. "ground_balls" → "Ground Balls"
 */
export function formatTag(tag) {
  return tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
