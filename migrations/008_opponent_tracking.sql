-- ============================================================================
-- CoachIQ - Migration 008: Opponent Tracking
-- ----------------------------------------------------------------------------
-- Adds data model for tracking opposing teams and opposing players so that
-- live game stats can be logged for both sides (priority P2 in the roadmap),
-- and so the P6 opposing-player threat calculator has historical data to
-- aggregate against.
--
-- Design notes:
--   * Opposing teams and players are scoped to a user team. A team's coach
--     builds their own scouting roster; we don't share across organizations.
--   * games.opposing_team_id links a scheduled game to a scouting roster.
--     The existing games.opponent string stays for display and back-compat.
--   * game_events gets a team_side discriminator ('home' | 'away') and an
--     optional opposing_player_id. Opponent events have athlete_id NULL.
--   * All operations are idempotent (IF NOT EXISTS guards).
-- ============================================================================

-- OPPOSING_TEAMS TABLE: per-team scouting roster of opposing programs
CREATE TABLE IF NOT EXISTS opposing_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OPPOSING_PLAYERS TABLE: scouted players on opposing teams
CREATE TABLE IF NOT EXISTS opposing_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opposing_team_id UUID NOT NULL REFERENCES opposing_teams(id) ON DELETE CASCADE,
    jersey_number INTEGER,
    display_name VARCHAR(120),
    primary_position VARCHAR(20)
        CHECK (primary_position IS NULL OR primary_position IN ('Attack', 'Midfield', 'Defense', 'Goalie', 'FOGO')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link games to a scouting roster (optional)
ALTER TABLE games
    ADD COLUMN IF NOT EXISTS opposing_team_id UUID REFERENCES opposing_teams(id) ON DELETE SET NULL;

-- Mark each game event as belonging to home or away side and optionally
-- attach to an opposing player. Default 'home' keeps existing rows correct.
ALTER TABLE game_events
    ADD COLUMN IF NOT EXISTS team_side VARCHAR(4) NOT NULL DEFAULT 'home'
        CHECK (team_side IN ('home', 'away')),
    ADD COLUMN IF NOT EXISTS opposing_player_id UUID REFERENCES opposing_players(id) ON DELETE SET NULL;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_opposing_teams_team ON opposing_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_opposing_players_team ON opposing_players(opposing_team_id);
CREATE INDEX IF NOT EXISTS idx_games_opposing_team ON games(opposing_team_id);
CREATE INDEX IF NOT EXISTS idx_game_events_team_side ON game_events(game_id, team_side);
CREATE INDEX IF NOT EXISTS idx_game_events_opposing_player ON game_events(opposing_player_id);

-- Auto-update timestamps (reuses the trigger function from migration 001)
DROP TRIGGER IF EXISTS update_opposing_teams_updated_at ON opposing_teams;
CREATE TRIGGER update_opposing_teams_updated_at
    BEFORE UPDATE ON opposing_teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_opposing_players_updated_at ON opposing_players;
CREATE TRIGGER update_opposing_players_updated_at
    BEFORE UPDATE ON opposing_players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEW: opposing_player_season_stats
-- ----------------------------------------------------------------------------
-- Aggregate opposing-player stats across all games that reference their
-- opposing_team. Feeds the P6 threat calculator's pre-game baseline.
-- ============================================================================

DROP VIEW IF EXISTS opposing_player_season_stats CASCADE;
CREATE VIEW opposing_player_season_stats AS
SELECT
    op.id                                                                  AS opposing_player_id,
    op.opposing_team_id,
    op.display_name,
    op.jersey_number,
    op.primary_position,
    COUNT(DISTINCT ge.game_id)                                             AS games_observed,
    COUNT(CASE WHEN ge.event_type = 'goal'            THEN 1 END)          AS goals,
    COUNT(CASE WHEN ge.event_type = 'assist'          THEN 1 END)          AS assists,
    COUNT(CASE WHEN ge.event_type = 'shot'            THEN 1 END)          AS shots,
    COUNT(CASE WHEN ge.event_type = 'shot_on_goal'    THEN 1 END)          AS shots_on_goal,
    COUNT(CASE WHEN ge.event_type = 'ground_ball'     THEN 1 END)          AS ground_balls,
    COUNT(CASE WHEN ge.event_type = 'turnover'        THEN 1 END)          AS turnovers,
    COUNT(CASE WHEN ge.event_type = 'caused_turnover' THEN 1 END)          AS caused_turnovers,
    COUNT(CASE WHEN ge.event_type = 'save'            THEN 1 END)          AS saves,
    COUNT(CASE WHEN ge.event_type = 'faceoff_win'     THEN 1 END)          AS faceoff_wins,
    COUNT(CASE WHEN ge.event_type = 'faceoff_loss'    THEN 1 END)          AS faceoff_losses,
    COUNT(CASE WHEN ge.event_type = 'penalty'         THEN 1 END)          AS penalties
FROM opposing_players op
LEFT JOIN game_events ge
    ON ge.opposing_player_id = op.id
   AND ge.team_side          = 'away'
GROUP BY op.id, op.opposing_team_id, op.display_name, op.jersey_number, op.primary_position;

-- ============================================================================
-- END OF MIGRATION 008
-- ============================================================================
