-- ============================================================================
-- Migration 010: Seasons and graduation month
-- ============================================================================
-- Replaces the implicit team-level `season` label with an explicit seasons
-- table scoped to team_id. Every game belongs to exactly one season, looked
-- up by game_date falling within [start_date, end_date]. The btree_gist
-- exclusion constraint prevents overlapping seasons per team so that lookup
-- is unambiguous. Youth coaches running concurrent programs should use
-- separate team rows.
--
-- Also introduces athletes.graduation_month so the daily graduation sweep
-- can deactivate players on a precise date rather than Dec 31 of grad year.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS seasons (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_date >= start_date),
    EXCLUDE USING gist (
        team_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
    )
);

CREATE INDEX IF NOT EXISTS idx_seasons_team ON seasons(team_id);
CREATE INDEX IF NOT EXISTS idx_seasons_dates ON seasons(team_id, start_date, end_date);

-- ─── games.season_id ─────────────────────────────────────────────────────────

ALTER TABLE games
    ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES seasons(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_games_season ON games(season_id);

-- Backfill: one 'Legacy' season per team that has games, covering min..max
-- game_date of the team. All existing games get associated with it.

INSERT INTO seasons (team_id, name, start_date, end_date)
SELECT
    g.team_id,
    'Legacy',
    MIN(g.game_date),
    MAX(g.game_date)
FROM games g
WHERE g.game_date IS NOT NULL
GROUP BY g.team_id
ON CONFLICT DO NOTHING;

UPDATE games g
   SET season_id = s.id
  FROM seasons s
 WHERE s.team_id = g.team_id
   AND s.name    = 'Legacy'
   AND g.season_id IS NULL;

-- ─── athletes.graduation_month ───────────────────────────────────────────────

ALTER TABLE athletes
    ADD COLUMN IF NOT EXISTS graduation_month SMALLINT
        CHECK (graduation_month BETWEEN 1 AND 12);
