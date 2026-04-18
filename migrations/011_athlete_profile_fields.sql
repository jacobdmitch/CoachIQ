-- ============================================================================
-- Migration 011: Athlete profile fields (shot hand, captain, depth tier)
-- ============================================================================
-- Adds three roster-planning fields coaches requested:
--   shot_hand   handedness for matchup planning ('right' | 'left' | 'both')
--   is_captain  flag surfaced in roster header
--   depth_tier  coach's mental model of playing time ('starter' | 'rotation'
--               | 'developmental'). Orthogonal to is_captain.
--
-- All three are nullable/optional (is_captain defaults false) so existing
-- rows remain valid without backfill.

ALTER TABLE athletes
    ADD COLUMN IF NOT EXISTS shot_hand  TEXT
        CHECK (shot_hand IN ('right','left','both')),
    ADD COLUMN IF NOT EXISTS is_captain BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS depth_tier TEXT
        CHECK (depth_tier IN ('starter','rotation','developmental'));
