-- ============================================================================
-- CoachIQ - Migration 004
-- Description: Adds starting_lineup to games and creates
--              game_situation_assignments table for per-game situation rosters.
-- ============================================================================

-- Add starting lineup JSONB to games
-- Shape: { "goalie": "<athleteId>", "field_0": "<athleteId>", ... }
ALTER TABLE games ADD COLUMN IF NOT EXISTS starting_lineup JSONB DEFAULT NULL;

-- Per-game situation player assignments
-- Coaches assign specific players to each situation type before the game.
-- If no assignment exists for a situation, the resolver falls back to AI auto-fill.
CREATE TABLE IF NOT EXISTS game_situation_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    situation_type VARCHAR(30) NOT NULL
        CHECK (situation_type IN (
            'man_up', 'man_down', 'faceoff', 'clear',
            'settled', 'transition', '6s_fast_break'
        )),
    player_ids UUID[] NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (game_id, situation_type)
);

CREATE INDEX IF NOT EXISTS idx_situation_assignments_game
    ON game_situation_assignments(game_id);

DROP TRIGGER IF EXISTS update_situation_assignments_updated_at ON game_situation_assignments;
CREATE TRIGGER update_situation_assignments_updated_at
    BEFORE UPDATE ON game_situation_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
