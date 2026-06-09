/**
 * localGameState.js — Client-side game state simulator for offline mode.
 *
 * Mirrors the minimum subset of the server's GameStateManager needed to keep
 * the sideline UI usable while the tablet is disconnected. The server remains
 * the source of truth — once online, the sync client replays queued ops and
 * then calls /events-since/:seqNo to reconcile anything a connected co-coach
 * did while we were offline.
 *
 * Design notes:
 *   - Accepts a server state snapshot in the constructor (fieldPositions,
 *     bench, scores, clock, period, subQueue). Optimistic mutations modify
 *     this local copy.
 *   - Clock math uses Date.now() + startTime offset, same as the server, so
 *     the UI keeps ticking while offline.
 *   - Sub-queue merge-alert logic is skipped: when offline there's a single
 *     writer (this tablet), so no merges. On reconnect the server's view wins.
 *   - Only mutation methods that the coach can reach during a game are
 *     implemented. Period transitions and end-game still require online.
 */

export class LocalGameState {
  constructor(snapshot) {
    // Full state snapshot from the server (getState() shape).
    this.state = JSON.parse(JSON.stringify(snapshot));
    // Local offset math for the clock — preserves ticking while offline.
    this.clockStartedAt = null;
    if (this.state.clockRunning) {
      // If the snapshot says the clock is running, anchor local time now so
      // the UI continues from the snapshot's clockTime.
      this.clockStartedAt = Date.now() - (this.state.clockTime || 0) * 1000;
    }
  }

  /** Return a fresh full-state snapshot. */
  getState() {
    // Refresh the clock reading if running.
    if (this.state.clockRunning && this.clockStartedAt != null) {
      this.state.clockTime = Math.floor((Date.now() - this.clockStartedAt) / 1000);
    }
    return JSON.parse(JSON.stringify(this.state));
  }

  /** Replace state wholesale — called after a reconcile from the server. */
  replace(snapshot) {
    this.state = JSON.parse(JSON.stringify(snapshot));
    this.clockStartedAt = this.state.clockRunning
      ? Date.now() - (this.state.clockTime || 0) * 1000
      : null;
  }

  // ─── Clock ────────────────────────────────────────────────────────────────
  startClock() {
    if (this.state.clockRunning) return;
    this.state.clockRunning = true;
    this.clockStartedAt = Date.now() - (this.state.clockTime || 0) * 1000;
  }

  stopClock() {
    if (!this.state.clockRunning) return;
    this.state.clockTime = Math.floor((Date.now() - this.clockStartedAt) / 1000);
    this.state.clockRunning = false;
    this.clockStartedAt = null;
  }

  // ─── Substitution ─────────────────────────────────────────────────────────
  /**
   * Swap a single player. Mirrors executeSubstitution on the server. Returns
   * true on success, false if the move is invalid.
   */
  executeSubstitution(playerIn, playerOut, position) {
    if (!this.state.bench.includes(playerIn)) return false;
    let outPosition = null;
    for (const [slot, id] of Object.entries(this.state.fieldPositions)) {
      if (id === playerOut) { outPosition = slot; break; }
    }
    if (!outPosition) return false;

    this.state.fieldPositions[outPosition] = null;
    this.state.fieldPositions[position] = playerIn;
    this.state.bench = this.state.bench.filter(id => id !== playerIn);
    this.state.bench.push(playerOut);
    return true;
  }

  // ─── Score ────────────────────────────────────────────────────────────────
  updateScore(team, points) {
    if (team === 'home') this.state.homeScore = points;
    else if (team === 'away') this.state.awayScore = points;
  }

  // ─── Events (for log + undo) ──────────────────────────────────────────────
  /**
   * Record an event locally. The server is the DB source-of-truth, but a
   * local copy lets the log + undo button keep working offline.
   */
  logEvent(eventType, athleteId, metadata = {}) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      athleteId,
      period: this.state.period,
      clockTime: this.state.clockTime,
      _local: true,
      ...metadata,
    };
    this.state.events = this.state.events || [];
    this.state.events.push(event);
    return event;
  }

  /**
   * Opponent event — stored with team_side=away flag so the log renders it
   * on the right side.
   */
  logOpponentEvent(eventType, opposingPlayerId, metadata = {}) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      team_side: 'away',
      opposingPlayerId,
      period: this.state.period,
      clockTime: this.state.clockTime,
      _local: true,
      ...metadata,
    };
    this.state.events = this.state.events || [];
    this.state.events.push(event);
    return event;
  }

  /** Remove the most recent undoable stat event. Returns the removed entry. */
  undoLastStatEvent() {
    const UNDOABLE = new Set([
      'GOAL', 'ASSIST', 'SHOT', 'SHOT_ON_GOAL',
      'GROUND_BALL', 'TURNOVER', 'CAUSED_TURNOVER',
      'SAVE', 'PENALTY', 'FACEOFF_WIN', 'FACEOFF_LOSS',
    ]);
    if (!this.state.events) return null;
    for (let i = this.state.events.length - 1; i >= 0; i--) {
      const t = this.state.events[i].type;
      if (UNDOABLE.has(typeof t === 'string' ? t.toUpperCase() : t)) {
        const [removed] = this.state.events.splice(i, 1);
        return removed;
      }
    }
    return null;
  }

  // ─── Sub queue ────────────────────────────────────────────────────────────
  /**
   * Offline sub-queue adds are naive: no merge-alert conflict resolution.
   * When we reconnect, the server's queue state wins via reconcile.
   */
  addToQueue(entry) {
    this.state.subQueue = this.state.subQueue || [];
    this.state.subQueue.push(entry);
  }

  removeFromQueue(queueId) {
    if (!this.state.subQueue) return;
    this.state.subQueue = this.state.subQueue.filter(e => e.queueId !== queueId);
  }

  removeMoveFromQueue(queueId, moveId) {
    if (!this.state.subQueue) return;
    const entry = this.state.subQueue.find(e => e.queueId === queueId);
    if (!entry) return;
    entry.moves = entry.moves.filter(m => m.moveId !== moveId);
    if (entry.moves.length === 0) this.removeFromQueue(queueId);
  }

  /**
   * Execute all staged queue entries. Returns true on success.
   * Validation is permissive offline — if something is inconsistent, the
   * server will reject it on replay and the sync client surfaces the error.
   */
  executeBatchSub() {
    if (!this.state.subQueue || this.state.subQueue.length === 0) return false;
    for (const entry of this.state.subQueue) {
      for (const move of entry.moves) {
        // Clear playerOut's slot
        for (const [slot, id] of Object.entries(this.state.fieldPositions)) {
          if (id === move.playerOut) this.state.fieldPositions[slot] = null;
        }
        this.state.fieldPositions[move.position] = move.playerIn;
        this.state.bench = this.state.bench.filter(id => id !== move.playerIn);
        this.state.bench.push(move.playerOut);
      }
    }
    this.state.subQueue = [];
    return true;
  }
}

export default LocalGameState;
