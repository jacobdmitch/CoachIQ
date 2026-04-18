-- ============================================================================
-- CoachIQ - Migration 014: Line rotation templates
-- ----------------------------------------------------------------------------
-- Phase 7: a rotation is an ordered sequence of saved lines the coach cycles
-- through during a game (e.g., Midi 1 → Midi 2 → Midi 3 → Midi 1).
--
-- Design notes:
--   * Pure template — where we are in the rotation (the current index) is
--     per-game client state, NOT persisted here. This matches how coaches
--     think about it ("run the A/B/C rotation for 2 minutes each") and avoids
--     cross-game state leaking between game sessions.
--   * Reuses lines.position_group — a rotation is tied to one group so the
--     "next up" preview can show which slots will change.
--   * line_ids is ordered; duplicates are legal (Line A → B → A is fine).
-- ============================================================================

CREATE TABLE IF NOT EXISTS line_rotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    position_group VARCHAR(20) NOT NULL
        CHECK (position_group IN ('attack', 'midfield', 'defense')),
    line_ids UUID[] NOT NULL CHECK (array_length(line_ids, 1) >= 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_rotations_team ON line_rotations(team_id);

DROP TRIGGER IF EXISTS update_line_rotations_updated_at ON line_rotations;
CREATE TRIGGER update_line_rotations_updated_at
    BEFORE UPDATE ON line_rotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- END OF MIGRATION 014
-- ============================================================================
