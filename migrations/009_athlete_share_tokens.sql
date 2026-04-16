-- ============================================================================
-- Migration 009: Athlete share tokens (P5 — player/parent season stats view)
-- ============================================================================
-- Lets a coach generate a time-limited, unauthenticated URL that renders a
-- read-only season stats page for a single athlete. The token is the only
-- credential — no login required for parents or players. Coach can revoke
-- any time. We intentionally do NOT expose coach notes, email, or any
-- opponent-scouting data through this surface.

CREATE TABLE IF NOT EXISTS athlete_share_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token               VARCHAR(64) NOT NULL UNIQUE,
    athlete_id          UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    created_by_coach_id UUID NOT NULL REFERENCES coaches(id)  ON DELETE CASCADE,
    expires_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    last_viewed_at      TIMESTAMPTZ,
    view_count          INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_athlete_share_tokens_athlete_id
    ON athlete_share_tokens(athlete_id);
CREATE INDEX IF NOT EXISTS idx_athlete_share_tokens_token
    ON athlete_share_tokens(token);
