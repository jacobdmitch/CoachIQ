-- Migration 006: athlete email and post-game summary preference
-- Adds optional contact email per athlete and a flag to send
-- personalized post-game stat summaries to that address.

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS email              VARCHAR(255),
  ADD COLUMN IF NOT EXISTS send_game_summary  BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index: only index rows that actually have an email
CREATE INDEX IF NOT EXISTS idx_athletes_email
  ON athletes (email)
  WHERE email IS NOT NULL;
