-- Migration 002: Team personalization fields
-- Adds logo storage and optional brand color to teams table

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS logo_url    VARCHAR(500),
  ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7);

-- Index for quick lookup by coach (already exists on coach_id, but ensure logo_url is accessible)
COMMENT ON COLUMN teams.logo_url IS 'Relative path to uploaded logo file, e.g. /uploads/logos/team-123.png';
COMMENT ON COLUMN teams.primary_color IS 'Hex color code for team accent, e.g. #C9A227';
