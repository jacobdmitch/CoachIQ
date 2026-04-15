import logger from './logger.js';

/**
 * Game state machine for managing live lacrosse game state.
 * States: NOT_STARTED -> ACTIVE -> PERIOD_BREAK -> ACTIVE -> COMPLETED
 *
 * Manages:
 * - Clock and period tracking
 * - Active lineup and bench assignments
 * - Team scores
 * - Game format (standard 11v11 or 6s)
 * - Event log
 */
export class GameStateManager {
  constructor(game, athletes) {
    /**
     * @param {Object} game - Game record from database
     * @param {Array} athletes - Roster of available athletes
     */
    this.gameId = game.id;
    this.format = game.format || 'standard'; // standard or 6s
    this.state = 'NOT_STARTED';
    this.startTime = null;
    this.period = 0;
    this.clockRunning = false;
    this.clockTime = 0; // seconds elapsed in current period
    this.periodDuration = this.format === '6s' ? 12 * 60 : 15 * 60; // 12 min for 6s, 15 for standard

    this.homeScore = game.score_home || 0;
    this.awayScore = game.score_away || 0;

    // Lineup tracking
    this.athletes = athletes;
    this.fieldPositions = this._initializeFieldPositions();
    this.bench = athletes.map((a) => a.id);

    // Events log
    this.events = [];
    this.lastEventTimestamp = 0;

    // Sub staging queue — transient, cleared after activation
    this.subQueue = [];
  }

  /**
   * Initialize field position slots based on game format
   * Standard: 11 on field (10 field + 1 goalie)
   * 6s: 6 on field (5 field + 1 goalie)
   * @private
   */
  _initializeFieldPositions() {
    const positionCount = this.format === '6s' ? 5 : 10;
    const positions = {};
    for (let i = 0; i < positionCount; i++) {
      positions[`field_${i}`] = null;
    }
    positions['goalie'] = null;
    return positions;
  }

  /**
   * Get complete serialized game state
   * @returns {Object} Full game state snapshot
   */
  getState() {
    return {
      gameId: this.gameId,
      format: this.format,
      state: this.state,
      period: this.period,
      clockRunning: this.clockRunning,
      clockTime: this.clockTime,
      periodDuration: this.periodDuration,
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      fieldPositions: this.fieldPositions,
      bench: this.bench,
      subQueue: this.subQueue,
      events: this.events,
      timestamp: Date.now(),
    };
  }

  /**
   * Start the game clock
   * @returns {Object} Event object for broadcasting
   */
  startClock() {
    if (this.clockRunning) {
      logger.warn('Clock already running');
      return null;
    }

    this.clockRunning = true;
    this.startTime = Date.now() - this.clockTime * 1000;

    const event = {
      type: 'CLOCK_STARTED',
      timestamp: Date.now(),
      clockTime: this.clockTime,
      period: this.period,
    };
    this.events.push(event);
    return event;
  }

  /**
   * Stop the game clock
   * @returns {Object} Event object for broadcasting
   */
  stopClock() {
    if (!this.clockRunning) {
      logger.warn('Clock not running');
      return null;
    }

    this.clockRunning = false;
    this.clockTime = Math.floor((Date.now() - this.startTime) / 1000);

    const event = {
      type: 'CLOCK_STOPPED',
      timestamp: Date.now(),
      clockTime: this.clockTime,
      period: this.period,
    };
    this.events.push(event);
    return event;
  }

  /**
   * End current period and transition to PERIOD_BREAK
   * @returns {Object} Event object for broadcasting
   */
  endPeriod() {
    if (this.clockRunning) {
      this.stopClock();
    }

    this.state = 'PERIOD_BREAK';
    const event = {
      type: 'PERIOD_ENDED',
      timestamp: Date.now(),
      period: this.period,
      clockTime: this.clockTime,
    };
    this.events.push(event);
    return event;
  }

  /**
   * Start the next period
   * @returns {Object} Event object for broadcasting
   */
  startNextPeriod() {
    if (this.state !== 'PERIOD_BREAK') {
      logger.warn('Cannot start next period - not in PERIOD_BREAK state');
      return null;
    }

    this.period += 1;
    this.clockTime = 0;
    this.clockRunning = false;
    this.state = 'ACTIVE';
    this.startTime = null;

    const event = {
      type: 'PERIOD_STARTED',
      timestamp: Date.now(),
      period: this.period,
    };
    this.events.push(event);
    return event;
  }

  /**
   * Substitute a player in from bench to field
   * @param {string|number} athleteId - Athlete to sub in
   * @param {string} positionSlot - Position slot (e.g., 'field_0', 'goalie')
   * @returns {Object} Event or error
   */
  subIn(athleteId, positionSlot) {
    // Validate position slot exists
    if (!this.fieldPositions.hasOwnProperty(positionSlot)) {
      return {
        error: `Invalid position slot: ${positionSlot}`,
        success: false,
      };
    }

    // Validate athlete not already on field
    for (const [slot, aid] of Object.entries(this.fieldPositions)) {
      if (aid === athleteId) {
        return {
          error: `Athlete ${athleteId} already on field at ${slot}`,
          success: false,
        };
      }
    }

    // Validate athlete is on bench
    if (!this.bench.includes(athleteId)) {
      return {
        error: `Athlete ${athleteId} not on bench`,
        success: false,
      };
    }

    // Execute substitution
    const previousAthlete = this.fieldPositions[positionSlot];
    this.fieldPositions[positionSlot] = athleteId;
    this.bench = this.bench.filter((id) => id !== athleteId);
    if (previousAthlete) {
      this.bench.push(previousAthlete);
    }

    const event = {
      type: 'PLAYER_SUBBED_IN',
      timestamp: Date.now(),
      athleteId,
      positionSlot,
      replacedAthlete: previousAthlete || null,
      period: this.period,
      clockTime: this.clockTime,
    };
    this.events.push(event);
    return event;
  }

  /**
   * Substitute a player out from field to bench
   * @param {string|number} athleteId - Athlete to sub out
   * @returns {Object} Event or error
   */
  subOut(athleteId) {
    // Find position slot where athlete is
    let foundSlot = null;
    for (const [slot, aid] of Object.entries(this.fieldPositions)) {
      if (aid === athleteId) {
        foundSlot = slot;
        break;
      }
    }

    if (!foundSlot) {
      return {
        error: `Athlete ${athleteId} not on field`,
        success: false,
      };
    }

    // Execute substitution
    this.fieldPositions[foundSlot] = null;
    this.bench.push(athleteId);

    const event = {
      type: 'PLAYER_SUBBED_OUT',
      timestamp: Date.now(),
      athleteId,
      positionSlot: foundSlot,
      period: this.period,
      clockTime: this.clockTime,
    };
    this.events.push(event);
    return event;
  }

  /**
   * Execute atomic substitution: player in, player out, specific position
   * @param {string|number} inId - Athlete to sub in
   * @param {string|number} outId - Athlete to sub out
   * @param {string} position - Position slot for sub in
   * @returns {Object} Combined event or error
   */
  executeSubstitution(inId, outId, position) {
    // Validate inId is on bench
    if (!this.bench.includes(inId)) {
      return { error: `Player ${inId} not on bench`, success: false };
    }

    // Validate outId is on field
    let outPosition = null;
    for (const [slot, aid] of Object.entries(this.fieldPositions)) {
      if (aid === outId) {
        outPosition = slot;
        break;
      }
    }
    if (!outPosition) {
      return { error: `Player ${outId} not on field`, success: false };
    }

    // Execute swap
    this.fieldPositions[position] = inId;
    this.fieldPositions[outPosition] = null;
    this.bench = this.bench.filter((id) => id !== inId);
    this.bench.push(outId);

    const event = {
      type: 'SUBSTITUTION',
      timestamp: Date.now(),
      playerIn: inId,
      playerOut: outId,
      positionIn: position,
      positionOut: outPosition,
      period: this.period,
      clockTime: this.clockTime,
    };
    this.events.push(event);
    return event;
  }

  /**
   * Log a game event (goal, assist, ground ball, etc.)
   * @param {string} eventType - Type of event (GOAL, ASSIST, GROUND_BALL, SHOT, etc.)
   * @param {string|number} athleteId - Athlete involved
   * @param {Object} metadata - Additional event data
   * @returns {Object} Event object
   */
  logEvent(eventType, athleteId, metadata = {}) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      athleteId,
      period: this.period,
      clockTime: this.clockTime,
      ...metadata,
    };
    this.events.push(event);
    return event;
  }

  /**
   * Update team score
   * @param {string} team - 'home' or 'away'
   * @param {number} points - Points to add/set
   * @returns {Object} Event object
   */
  updateScore(team, points) {
    const previousScore = team === 'home' ? this.homeScore : this.awayScore;

    if (team === 'home') {
      this.homeScore = points;
    } else if (team === 'away') {
      this.awayScore = points;
    } else {
      return { error: 'Invalid team', success: false };
    }

    const event = {
      type: 'SCORE_UPDATED',
      timestamp: Date.now(),
      team,
      previousScore,
      newScore: points,
      period: this.period,
      clockTime: this.clockTime,
    };
    this.events.push(event);
    return event;
  }

  /**
   * Apply a remote event from another device (for multi-coach sync)
   * @param {Object} event - Event to apply
   * @returns {boolean} Success
   */
  applyRemoteEvent(event) {
    try {
      switch (event.type) {
        case 'SCORE_UPDATED':
          if (event.team === 'home') {
            this.homeScore = event.newScore;
          } else {
            this.awayScore = event.newScore;
          }
          break;
        case 'SUBSTITUTION':
          this.fieldPositions[event.positionIn] = event.playerIn;
          this.fieldPositions[event.positionOut] = null;
          this.bench = this.bench.filter((id) => id !== event.playerIn);
          this.bench.push(event.playerOut);
          break;
        case 'PERIOD_STARTED':
          this.period = event.period;
          this.clockTime = 0;
          this.state = 'ACTIVE';
          break;
        case 'PERIOD_ENDED':
          this.state = 'PERIOD_BREAK';
          break;
        default:
          logger.debug(`Ignoring remote event type: ${event.type}`);
      }
      this.events.push({ ...event, applied_remote: true });
      return true;
    } catch (err) {
      logger.error('Error applying remote event:', err);
      return false;
    }
  }

  /**
   * Get events since a specific timestamp for sync purposes
   * @param {number} timestamp - Milliseconds since epoch
   * @returns {Array} Events since timestamp
   */
  getStateSince(timestamp) {
    return this.events.filter((e) => e.timestamp >= timestamp);
  }

  // ─── Sub Queue ────────────────────────────────────────────────────────────────

  /**
   * Add an entry to the sub queue with auto-merge conflict resolution.
   * If the new entry shares a player with an existing entry, the conflicting
   * move is removed from the existing entry (later action wins) and an alert
   * is returned so the UI can notify the coach.
   *
   * @param {Object} entry - Queue entry from resolveSituation / resolveLineSwap / individual
   * @returns {{ entry: Object, mergeAlerts: Array }}
   */
  addToQueue(entry) {
    const mergeAlerts = [];
    const newPlayerIds = new Set([
      ...entry.moves.map(m => m.playerIn),
      ...entry.moves.map(m => m.playerOut),
    ]);

    for (const existing of this.subQueue) {
      const toRemove = existing.moves.filter(
        m => newPlayerIds.has(m.playerIn) || newPlayerIds.has(m.playerOut)
      );
      if (toRemove.length === 0) continue;

      // Remove conflicting moves from existing entry
      existing.moves = existing.moves.filter(
        m => !newPlayerIds.has(m.playerIn) && !newPlayerIds.has(m.playerOut)
      );

      for (const move of toRemove) {
        const conflictId = newPlayerIds.has(move.playerIn) ? move.playerIn : move.playerOut;
        const athlete    = this.athletes.find(a => a.id === conflictId);
        const name       = athlete ? `${athlete.first_name} ${athlete.last_name}` : conflictId;
        mergeAlerts.push({
          message: `${name} moved from "${existing.label}" to "${entry.label}"`,
          affectedEntry: existing.label,
        });
      }
    }

    // Drop empty entries left after merge
    this.subQueue = this.subQueue.filter(e => e.moves.length > 0);
    this.subQueue.push(entry);

    return { entry, mergeAlerts };
  }

  /**
   * Remove an entire queue entry by its queueId.
   */
  removeFromQueue(queueId) {
    this.subQueue = this.subQueue.filter(e => e.queueId !== queueId);
  }

  /**
   * Remove a single move from a queue entry.
   * If the entry has no moves remaining, the entry is also removed.
   */
  removeMoveFromQueue(queueId, moveId) {
    const entry = this.subQueue.find(e => e.queueId === queueId);
    if (!entry) return;
    entry.moves = entry.moves.filter(m => m.moveId !== moveId);
    if (entry.moves.length === 0) this.removeFromQueue(queueId);
  }

  /**
   * Clear the entire sub queue.
   */
  clearQueue() {
    this.subQueue = [];
  }

  /**
   * Validate the entire queue before activation.
   * @returns {string[]} Array of error messages (empty = valid)
   */
  validateQueue() {
    const errors      = [];
    const playerInSet = new Set();
    const playerOutSet= new Set();
    const positionSet = new Set();

    for (const entry of this.subQueue) {
      for (const move of entry.moves) {
        const inName  = this._athleteName(move.playerIn);
        const outName = this._athleteName(move.playerOut);

        if (move.playerIn === move.playerOut) {
          errors.push(`${inName} is queued as both in and out`);
        }
        if (playerInSet.has(move.playerIn)) {
          errors.push(`${inName} is queued to sub in more than once`);
        }
        if (playerOutSet.has(move.playerOut)) {
          errors.push(`${outName} is queued to sub out more than once`);
        }
        if (positionSet.has(move.position)) {
          errors.push(`Position ${move.position} is targeted by more than one sub`);
        }
        if (!this.bench.includes(move.playerIn)) {
          errors.push(`${inName} is not on the bench`);
        }
        if (!Object.values(this.fieldPositions).includes(move.playerOut)) {
          errors.push(`${outName} is not on the field`);
        }

        playerInSet.add(move.playerIn);
        playerOutSet.add(move.playerOut);
        positionSet.add(move.position);
      }
    }

    return errors;
  }

  /**
   * Execute all staged queue entries atomically.
   * Clears the queue on success.
   * @returns {{ success: boolean, event?: Object, executedMoves?: Array, errors?: string[] }}
   */
  executeBatchSub() {
    if (this.subQueue.length === 0) {
      return { success: false, errors: ['Sub queue is empty'] };
    }

    const errors = this.validateQueue();
    if (errors.length > 0) return { success: false, errors };

    const timestamp     = Date.now();
    const executedMoves = [];

    for (const entry of this.subQueue) {
      for (const move of entry.moves) {
        // Find and clear playerOut's current slot
        for (const [slot, id] of Object.entries(this.fieldPositions)) {
          if (id === move.playerOut) {
            this.fieldPositions[slot] = null;
            break;
          }
        }
        // Place playerIn in target position
        this.fieldPositions[move.position] = move.playerIn;
        this.bench = this.bench.filter(id => id !== move.playerIn);
        this.bench.push(move.playerOut);

        executedMoves.push({ ...move, timestamp });
      }
    }

    const event = {
      type:      'BATCH_SUBSTITUTION',
      timestamp,
      moves:     executedMoves,
      period:    this.period,
      clockTime: this.clockTime,
    };
    this.events.push(event);
    this.subQueue = [];

    return { success: true, event, executedMoves };
  }

  // ─── Line swap resolution ─────────────────────────────────────────────────────

  // Slot mapping per format per position group
  static POSITION_GROUP_SLOTS = {
    standard: {
      attack:   ['field_0', 'field_1', 'field_2'],
      midfield: ['field_3', 'field_4', 'field_5'],
      defense:  ['field_6', 'field_7', 'field_8'],
    },
    '6s': {
      attack:   ['field_0', 'field_1'],
      midfield: ['field_2', 'field_3'],
      defense:  ['field_4'],
    },
  };

  /**
   * Resolve a saved line into a sub-queue entry.
   * Honors current positions: if a line player is already on the field
   * (anywhere), they stay. Only line players on the bench generate a move.
   *
   * @param {Object} line - Line record from DB { id, name, position_group, player_ids }
   * @returns {Object} Sub-queue entry
   */
  resolveLineSwap(line) {
    const { name, position_group: positionGroup, player_ids: playerIds } = line;
    const slots = GameStateManager.POSITION_GROUP_SLOTS[this.format]?.[positionGroup] || [];

    const onFieldIds = new Set(
      Object.values(this.fieldPositions).filter(Boolean)
    );

    // Split line players: already on field (staying) vs. on bench (coming in)
    const staying  = playerIds.filter(id => onFieldIds.has(id));
    const comingIn = playerIds.filter(id => this.bench.includes(id));

    // Non-line players currently in the position group's slots
    // These are the pull candidates — we pull as many as needed (comingIn.length)
    const nonLineSlotsOccupants = slots
      .map(slot => ({ slot, id: this.fieldPositions[slot] }))
      .filter(({ id }) => id !== null && !playerIds.includes(id));

    const moves = [];
    for (let i = 0; i < Math.min(comingIn.length, nonLineSlotsOccupants.length); i++) {
      moves.push({
        moveId:    crypto.randomUUID(),
        playerIn:  comingIn[i],
        playerOut: nonLineSlotsOccupants[i].id,
        position:  nonLineSlotsOccupants[i].slot,
      });
    }

    return {
      queueId:        crypto.randomUUID(),
      type:           'line',
      label:          name,
      source:         'line',
      situationType:  null,
      stayingPlayers: staying,
      moves,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  _athleteName(athleteId) {
    const a = this.athletes.find(x => x.id === athleteId);
    return a ? `${a.first_name} ${a.last_name}` : athleteId;
  }
}

export default GameStateManager;
