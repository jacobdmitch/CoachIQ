-- Migration 016: ai_invocation_log
--
-- Per-tool-invocation audit trail for the Line Coach agentic loop. Distinct
-- from ai_call_logs (which tracks per-API-call totals like tokens/cost).
-- A single ai_call_logs row can own many ai_invocation_log rows when the
-- agentic recovery loop runs multiple turns.
--
-- Used for:
--   - Replaying what the coach saw (what tools fired, with what args, what results)
--   - Diagnosing tool failures (is_error=true rows grouped by tool_name)
--   - Analyzing per-tool accept rates once the card UI is wired up

CREATE TABLE IF NOT EXISTS ai_invocation_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id        UUID REFERENCES coaches(id) ON DELETE SET NULL,
    game_id         UUID REFERENCES games(id)   ON DELETE SET NULL,
    call_log_id     UUID REFERENCES ai_call_logs(id) ON DELETE SET NULL,
    agent_id        VARCHAR(64)  NOT NULL,
    tool_name       VARCHAR(100) NOT NULL,
    input           JSONB,
    output          JSONB,
    is_error        BOOLEAN NOT NULL DEFAULT FALSE,
    error_message   TEXT,
    iteration       INTEGER,
    latency_ms      INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Common query paths
CREATE INDEX IF NOT EXISTS idx_ai_invocation_log_game_id    ON ai_invocation_log(game_id);
CREATE INDEX IF NOT EXISTS idx_ai_invocation_log_coach_id   ON ai_invocation_log(coach_id);
CREATE INDEX IF NOT EXISTS idx_ai_invocation_log_call_id    ON ai_invocation_log(call_log_id);
CREATE INDEX IF NOT EXISTS idx_ai_invocation_log_created_at ON ai_invocation_log(created_at DESC);

-- Failure-rate-by-tool queries
CREATE INDEX IF NOT EXISTS idx_ai_invocation_log_tool_errors
    ON ai_invocation_log(tool_name, is_error);
