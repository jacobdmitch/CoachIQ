-- ============================================================================
-- CoachIQ - Migration 012: Idempotency + Event Sequence Numbers
-- ----------------------------------------------------------------------------
-- Adds the foundation needed for:
--   * Phase 2 multi-coach sync — attribute events to the coach that logged
--     them and resolve duplicate submissions from concurrent devices.
--   * Phase 3 offline-first — allow the client to safely replay queued
--     events on reconnect without double-applying any state changes.
--
-- Two mechanisms:
--   1. game_events.seq_no — monotonic per game; clients track the last
--      seq_no they have and call /events-since/:seqNo on reconnect to pull
--      anything they missed.
--   2. idempotency_records — keyed by a client-generated UUID. Any mutation
--      endpoint can stash its response here, and a retried call with the
--      same key short-circuits to the cached result. Covers operations that
--      do NOT write to game_events (subs, score updates, clock control).
--
-- All operations are idempotent (IF NOT EXISTS guards).
-- ============================================================================

-- ─── game_events: seq_no, client_timestamp, coach_id ────────────────────────
ALTER TABLE game_events
    ADD COLUMN IF NOT EXISTS seq_no BIGSERIAL,
    ADD COLUMN IF NOT EXISTS client_timestamp TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_game_events_seq      ON game_events(game_id, seq_no);
CREATE INDEX IF NOT EXISTS idx_game_events_coach    ON game_events(coach_id);

-- ─── idempotency_records table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_records (
    idempotency_key UUID PRIMARY KEY,
    game_id         UUID REFERENCES games(id)   ON DELETE CASCADE,
    coach_id        UUID REFERENCES coaches(id) ON DELETE SET NULL,
    operation       VARCHAR(40) NOT NULL,
    response_json   JSONB NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idempotency_game    ON idempotency_records(game_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_records(created_at);

-- ============================================================================
-- END OF MIGRATION 012
-- ============================================================================
