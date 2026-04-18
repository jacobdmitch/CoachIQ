-- ============================================================================
-- CoachIQ - Migration 015: Parent contacts for athlete profiles
-- ----------------------------------------------------------------------------
-- Adds a normalized parent_contacts table so each athlete can have one or more
-- parent/guardian contacts. Drives:
--   * The Parent Contacts section of the athlete profile UI (coach can + add
--     or × remove rows).
--   * The post-game summary recipient list — emails of parent contacts are
--     included alongside athletes.email when send_game_summary is true.
--
-- Design notes:
--   * Normalized (child table) rather than parent1_*/parent2_* columns so the
--     "+ add another contact" UX isn't capped at N.
--   * ON DELETE CASCADE so removing an athlete also removes their contacts.
--   * email is nullable because some contacts are phone-only (gameday binder).
--     A partial index keeps lookups on email fast while tolerating nulls.
--   * No unique constraint on (athlete_id, email) — two parents can legitimately
--     share an email address, and we don't want saves to fail on that.
-- ============================================================================

CREATE TABLE IF NOT EXISTS parent_contacts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    name       TEXT,
    email      TEXT,
    phone      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_contacts_athlete
    ON parent_contacts(athlete_id);

CREATE INDEX IF NOT EXISTS idx_parent_contacts_email
    ON parent_contacts(email)
    WHERE email IS NOT NULL;

DROP TRIGGER IF EXISTS update_parent_contacts_updated_at ON parent_contacts;
CREATE TRIGGER update_parent_contacts_updated_at
    BEFORE UPDATE ON parent_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- END OF MIGRATION 015
-- ============================================================================
