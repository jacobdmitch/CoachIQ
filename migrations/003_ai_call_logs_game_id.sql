-- Migration 003: Add game_id to ai_call_logs for per-game AI usage tracking
-- This enables the /ai-coach/stats/:gameId and /ai-coach/conversation/:gameId
-- endpoints to return game-scoped data instead of all coach data.

ALTER TABLE ai_call_logs
  ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES games(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_call_logs_game_id ON ai_call_logs(game_id);
