-- ============================================================================
-- CoachIQ - Migration 013: Film-session stats for opposing players
-- ----------------------------------------------------------------------------
-- Phase 6: pre-game opponent scouting.
--
-- Coaches build an opposing roster and enter per-player stats they observed
-- from film BEFORE we've ever logged a game against the opponent. Without
-- this, the P6 threat calculator has no baseline on a new scouting report
-- and every player looks LOW until the game is underway.
--
-- Design notes:
--   * New opposing_player_film_stats row per opposing_player (1:1). Counts are
--     totals across all film watched; coaches update them as they scout more.
--   * games_observed mirrors the existing view's semantic (how many games of
--     data this represents). Coaches set it manually from film.
--   * The existing opposing_player_season_stats view is rebuilt to COALESCE
--     film stats with live event aggregates so the threat calculator pulls
--     from a single source.
--   * Live game events always *add* to film totals — the live gameplay is
--     additive scouting. This lets a coach enter "3 goals from film" and
--     still see "+2 live" update it during the current game.
-- ============================================================================

CREATE TABLE IF NOT EXISTS opposing_player_film_stats (
    opposing_player_id UUID PRIMARY KEY REFERENCES opposing_players(id) ON DELETE CASCADE,
    games_observed INTEGER NOT NULL DEFAULT 0 CHECK (games_observed >= 0),
    goals            INTEGER NOT NULL DEFAULT 0 CHECK (goals >= 0),
    assists          INTEGER NOT NULL DEFAULT 0 CHECK (assists >= 0),
    shots            INTEGER NOT NULL DEFAULT 0 CHECK (shots >= 0),
    shots_on_goal    INTEGER NOT NULL DEFAULT 0 CHECK (shots_on_goal >= 0),
    ground_balls     INTEGER NOT NULL DEFAULT 0 CHECK (ground_balls >= 0),
    turnovers        INTEGER NOT NULL DEFAULT 0 CHECK (turnovers >= 0),
    caused_turnovers INTEGER NOT NULL DEFAULT 0 CHECK (caused_turnovers >= 0),
    saves            INTEGER NOT NULL DEFAULT 0 CHECK (saves >= 0),
    faceoff_wins     INTEGER NOT NULL DEFAULT 0 CHECK (faceoff_wins >= 0),
    faceoff_losses   INTEGER NOT NULL DEFAULT 0 CHECK (faceoff_losses >= 0),
    penalties        INTEGER NOT NULL DEFAULT 0 CHECK (penalties >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_opposing_player_film_stats_updated_at ON opposing_player_film_stats;
CREATE TRIGGER update_opposing_player_film_stats_updated_at
    BEFORE UPDATE ON opposing_player_film_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Rebuild the aggregation view to union live game events with film totals.
-- CASCADE drops any dependent objects; there are none expected.
DROP VIEW IF EXISTS opposing_player_season_stats CASCADE;
CREATE VIEW opposing_player_season_stats AS
WITH live_counts AS (
    SELECT
        op.id AS opposing_player_id,
        COUNT(DISTINCT ge.game_id)                                        AS games_observed,
        COUNT(CASE WHEN ge.event_type = 'goal'            THEN 1 END)     AS goals,
        COUNT(CASE WHEN ge.event_type = 'assist'          THEN 1 END)     AS assists,
        COUNT(CASE WHEN ge.event_type = 'shot'            THEN 1 END)     AS shots,
        COUNT(CASE WHEN ge.event_type = 'shot_on_goal'    THEN 1 END)     AS shots_on_goal,
        COUNT(CASE WHEN ge.event_type = 'ground_ball'     THEN 1 END)     AS ground_balls,
        COUNT(CASE WHEN ge.event_type = 'turnover'        THEN 1 END)     AS turnovers,
        COUNT(CASE WHEN ge.event_type = 'caused_turnover' THEN 1 END)     AS caused_turnovers,
        COUNT(CASE WHEN ge.event_type = 'save'            THEN 1 END)     AS saves,
        COUNT(CASE WHEN ge.event_type = 'faceoff_win'     THEN 1 END)     AS faceoff_wins,
        COUNT(CASE WHEN ge.event_type = 'faceoff_loss'    THEN 1 END)     AS faceoff_losses,
        COUNT(CASE WHEN ge.event_type = 'penalty'         THEN 1 END)     AS penalties
    FROM opposing_players op
    LEFT JOIN game_events ge
        ON ge.opposing_player_id = op.id
       AND ge.team_side          = 'away'
    GROUP BY op.id
)
SELECT
    op.id                              AS opposing_player_id,
    op.opposing_team_id,
    op.display_name,
    op.jersey_number,
    op.primary_position,
    COALESCE(lc.games_observed, 0)     + COALESCE(f.games_observed, 0)   AS games_observed,
    COALESCE(lc.goals, 0)              + COALESCE(f.goals, 0)            AS goals,
    COALESCE(lc.assists, 0)            + COALESCE(f.assists, 0)          AS assists,
    COALESCE(lc.shots, 0)              + COALESCE(f.shots, 0)            AS shots,
    COALESCE(lc.shots_on_goal, 0)      + COALESCE(f.shots_on_goal, 0)    AS shots_on_goal,
    COALESCE(lc.ground_balls, 0)       + COALESCE(f.ground_balls, 0)     AS ground_balls,
    COALESCE(lc.turnovers, 0)          + COALESCE(f.turnovers, 0)        AS turnovers,
    COALESCE(lc.caused_turnovers, 0)   + COALESCE(f.caused_turnovers, 0) AS caused_turnovers,
    COALESCE(lc.saves, 0)              + COALESCE(f.saves, 0)            AS saves,
    COALESCE(lc.faceoff_wins, 0)       + COALESCE(f.faceoff_wins, 0)     AS faceoff_wins,
    COALESCE(lc.faceoff_losses, 0)     + COALESCE(f.faceoff_losses, 0)   AS faceoff_losses,
    COALESCE(lc.penalties, 0)          + COALESCE(f.penalties, 0)        AS penalties
FROM opposing_players op
LEFT JOIN live_counts                 lc ON lc.opposing_player_id = op.id
LEFT JOIN opposing_player_film_stats  f  ON f.opposing_player_id  = op.id;

-- ============================================================================
-- END OF MIGRATION 013
-- ============================================================================
