import logger from './logger.js';

/**
 * Playtime tracker for per-player time management.
 * Tracks total seconds played, current period time,
 * and provides equity analysis and substitution recommendations.
 */
export class PlaytimeTracker {
  constructor(athletes, targetMinutes = 15) {
    /**
     * @param {Array} athletes - List of athlete objects with id property
     * @param {number} targetMinutes - Target playtime minutes per athlete
     */
    this.targetMinutes = targetMinutes;
    this.targetSeconds = targetMinutes * 60;

    // Initialize tracking for each athlete
    this.playtime = {};
    for (const athlete of athletes) {
      this.playtime[athlete.id] = {
        athleteId: athlete.id,
        totalSeconds: 0,
        currentPeriodSeconds: 0,
        isOnField: false,
        lastSubInTime: null,
        targetMinutes,
        periodHistory: {},
      };
    }
  }

  /**
   * Record player sub-in time
   * @param {string|number} athleteId - Athlete ID
   * @param {number} timestamp - Milliseconds since epoch
   * @returns {Object} Tracking entry
   */
  subIn(athleteId, timestamp) {
    if (!this.playtime[athleteId]) {
      logger.warn(`Unknown athlete: ${athleteId}`);
      return null;
    }

    this.playtime[athleteId].isOnField = true;
    this.playtime[athleteId].lastSubInTime = timestamp;
    return this.playtime[athleteId];
  }

  /**
   * Record player sub-out time and accumulate seconds
   * @param {string|number} athleteId - Athlete ID
   * @param {number} timestamp - Milliseconds since epoch
   * @returns {Object} Updated tracking entry
   */
  subOut(athleteId, timestamp) {
    if (!this.playtime[athleteId]) {
      logger.warn(`Unknown athlete: ${athleteId}`);
      return null;
    }

    const entry = this.playtime[athleteId];
    if (!entry.isOnField || !entry.lastSubInTime) {
      logger.warn(
        `Athlete ${athleteId} was not on field or missing sub-in time`
      );
      return entry;
    }

    // Calculate time played
    const secondsPlayed = Math.floor((timestamp - entry.lastSubInTime) / 1000);
    entry.totalSeconds += secondsPlayed;
    entry.currentPeriodSeconds += secondsPlayed;
    entry.isOnField = false;
    entry.lastSubInTime = null;

    return entry;
  }

  /**
   * Update all active players' time (called periodically by clock)
   * @param {number} timestamp - Current timestamp
   */
  tick(timestamp) {
    for (const [athleteId, entry] of Object.entries(this.playtime)) {
      if (entry.isOnField && entry.lastSubInTime) {
        const elapsed = Math.floor((timestamp - entry.lastSubInTime) / 1000);
        entry.currentPeriodSeconds = elapsed;
      }
    }
  }

  /**
   * Get playtime summary for all athletes
   * @returns {Array} Athletes with current vs target minutes
   */
  getPlaytimeSummary() {
    return Object.values(this.playtime).map((entry) => ({
      athleteId: entry.athleteId,
      totalMinutes: Math.floor(entry.totalSeconds / 60),
      totalSeconds: entry.totalSeconds,
      currentPeriodMinutes: Math.floor(entry.currentPeriodSeconds / 60),
      currentPeriodSeconds: entry.currentPeriodSeconds,
      targetMinutes: entry.targetMinutes,
      targetSeconds: entry.targetMinutes * 60,
      isOnField: entry.isOnField,
      minutesRemaining: Math.max(
        0,
        entry.targetMinutes - Math.floor(entry.totalSeconds / 60)
      ),
    }));
  }

  /**
   * Get equity flags for athletes over/under target
   * @param {number} toleranceMinutes - Tolerance threshold (default 2 minutes)
   * @returns {Array} Athletes flagged as under/over target
   */
  getEquityFlags(toleranceMinutes = 2) {
    const toleranceSeconds = toleranceMinutes * 60;
    const flags = [];

    for (const entry of Object.values(this.playtime)) {
      const diff = entry.totalSeconds - this.targetSeconds;

      if (diff < -toleranceSeconds) {
        flags.push({
          athleteId: entry.athleteId,
          status: 'UNDER_TARGET',
          minutesUnder: Math.ceil(-diff / 60),
          totalMinutes: Math.floor(entry.totalSeconds / 60),
          targetMinutes: entry.targetMinutes,
          urgency: -diff > this.targetSeconds * 0.5 ? 'HIGH' : 'MEDIUM',
        });
      } else if (diff > toleranceSeconds) {
        flags.push({
          athleteId: entry.athleteId,
          status: 'OVER_TARGET',
          minutesOver: Math.ceil(diff / 60),
          totalMinutes: Math.floor(entry.totalSeconds / 60),
          targetMinutes: entry.targetMinutes,
          urgency: diff > this.targetSeconds * 0.5 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    return flags.sort((a, b) => {
      const urgencyOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
  }

  /**
   * Get recommended substitutions based on playtime equity
   * @returns {Array} Suggested substitutions with rationale
   */
  getRecommendedSubs() {
    const flags = this.getEquityFlags();
    const recommendations = [];

    // Find players significantly under target
    const underTargetPlayers = flags.filter(
      (f) => f.status === 'UNDER_TARGET' && f.urgency === 'HIGH'
    );
    // Find players who can come out (on field and meeting minimum)
    const overTargetPlayers = flags.filter(
      (f) => f.status === 'OVER_TARGET' && f.urgency === 'HIGH'
    );

    for (const under of underTargetPlayers) {
      for (const over of overTargetPlayers) {
        recommendations.push({
          playerIn: under.athleteId,
          playerOut: over.athleteId,
          reason: `${under.athleteId} needs ${under.minutesUnder} more minutes; ${over.athleteId} has ${over.minutesOver} extra minutes`,
          urgency: 'HIGH',
          equityGain: Math.min(under.minutesUnder, over.minutesOver),
        });
      }
    }

    return recommendations.sort((a, b) => b.equityGain - a.equityGain);
  }

  /**
   * End current period: freeze times and prepare for next
   */
  endPeriod() {
    for (const entry of Object.values(this.playtime)) {
      entry.currentPeriodSeconds = 0;
    }
  }

  /**
   * Get playtime summary for a specific period
   * @param {number} period - Period number
   * @returns {Object} Playtime by athlete for that period
   */
  getPeriodSummary(period) {
    const summary = {};
    for (const [athleteId, entry] of Object.entries(this.playtime)) {
      summary[athleteId] = {
        period,
        minutes: entry.periodHistory[period]
          ? Math.floor(entry.periodHistory[period] / 60)
          : 0,
        seconds: entry.periodHistory[period] || 0,
      };
    }
    return summary;
  }
}

export default PlaytimeTracker;
