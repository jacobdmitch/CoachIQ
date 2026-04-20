-- Migration 017: proactive_push_log
--
-- Record of every proactive recommendation the Line Coach pushes during a
-- live game. Separate from ai_call_logs (per-API-call) and ai_invocation_log
-- (per-tool): this table tracks coach-facing pushes that actually reached the
-- sideline, including whether the coach acknowledged or dismissed them.
--
-- Used for:
--   - Post-game review of what the AI surfaced and when
--   - Tuning cooldowns and urgency thresholds after beta
--   - Computing accept/dismiss rates per recommendation type

CREATE TABLE IF NOT EXISTS proactive_push_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id          UUID REFERENCES games(id)   ON DELETE CASCADE,
    coach_id         UUID REFERENCES coaches(id) ON DELETE SET NULL,
    rec_type         VARCHAR(64)  NOT NULL,
    urgency          VARCHAR(16)  NOT NULL DEFAULT 'medium',
    trigger_reason   VARCHAR(64),
    payload          JSONB NOT NULL,
    pushed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at  TIMESTAMPTZ,
    dismissed_at     TIMESTAMPTZ
);

-- Most queries are "recent pushes for a game", newest first
CREATE INDEX IF NOT EXISTS idx_proactive_push_log_game_pushed
    ON proactive_push_log(game_id, pushed_at DESC);

-- Per-coach accept rate analysis
CREATE INDEX IF NOT EXISTS idx_proactive_push_log_coach
    ON proactive_push_log(coach_id);

-- Accept/dismiss rate by rec type
CREATE INDEX IF NOT EXISTS idx_proactive_push_log_type
    ON proactive_push_log(rec_type);
