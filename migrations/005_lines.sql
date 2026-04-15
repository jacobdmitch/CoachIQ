-- ============================================================================
-- CoachIQ - Migration 005
-- Description: Creates the lines table for saved player group sets.
--              Lines are reusable across games (owned by team, not game).
-- ============================================================================

-- Saved player groupings for bulk position-group substitutions.
-- position_group determines which field slots the line maps to.
-- player_ids order is meaningful: index 0 → first slot in the group, etc.
CREATE TABLE IF NOT EXISTS lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    position_group VARCHAR(20) NOT NULL
        CHECK (position_group IN ('attack', 'midfield', 'defense')),
    player_ids UUID[] NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lines_team ON lines(team_id);

DROP TRIGGER IF EXISTS update_lines_updated_at ON lines;
CREATE TRIGGER update_lines_updated_at
    BEFORE UPDATE ON lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
