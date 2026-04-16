-- Migration 007: Add start_time to games and practice_sessions
-- Nullable TIME column — existing rows stay valid, UI shows time only when present

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS start_time TIME;

ALTER TABLE practice_sessions
  ADD COLUMN IF NOT EXISTS start_time TIME;
