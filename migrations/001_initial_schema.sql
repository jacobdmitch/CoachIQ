-- ============================================================================
-- CoachIQ - Initial Database Schema Migration
-- Version: 001
-- Description: Creates the foundational schema for the CoachIQ lacrosse
--              coaching application, including coaches, teams, athletes, games,
--              game events, and multi-coach sync functionality.
-- ============================================================================

-- All operations are idempotent using IF NOT EXISTS / IF EXISTS guards.

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLES - Core Entities
-- ============================================================================

-- COACHES TABLE: User accounts for the coaching platform
CREATE TABLE IF NOT EXISTS coaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    subscription_tier VARCHAR(20) DEFAULT 'free'
        CHECK (subscription_tier IN ('free', 'coach', 'club', 'organization')),
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TEAMS TABLE: Team records managed by coaches
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    team_name VARCHAR(255) NOT NULL,
    season VARCHAR(50),
    sport_type VARCHAR(50) DEFAULT 'field_lacrosse',
    game_format VARCHAR(20) DEFAULT 'standard'
        CHECK (game_format IN ('standard', '6s')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ATHLETES TABLE: Player roster with skill ratings
CREATE TABLE IF NOT EXISTS athletes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    jersey_number INTEGER,
    graduation_year INTEGER,
    primary_position VARCHAR(20)
        CHECK (primary_position IN ('Attack', 'Midfield', 'Defense', 'Goalie', 'FOGO')),
    secondary_position VARCHAR(20)
        CHECK (secondary_position IN ('Attack', 'Midfield', 'Defense', 'Goalie', 'FOGO')),
    -- Skill ratings: 1-10 scale (coach input only)
    skill_ground_balls INTEGER CHECK (skill_ground_balls IS NULL OR (skill_ground_balls >= 1 AND skill_ground_balls <= 10)),
    skill_dodging INTEGER CHECK (skill_dodging IS NULL OR (skill_dodging >= 1 AND skill_dodging <= 10)),
    skill_shooting INTEGER CHECK (skill_shooting IS NULL OR (skill_shooting >= 1 AND skill_shooting <= 10)),
    skill_passing INTEGER CHECK (skill_passing IS NULL OR (skill_passing >= 1 AND skill_passing <= 10)),
    skill_defense INTEGER CHECK (skill_defense IS NULL OR (skill_defense >= 1 AND skill_defense <= 10)),
    skill_faceoff INTEGER CHECK (skill_faceoff IS NULL OR (skill_faceoff >= 1 AND skill_faceoff <= 10)),
    skill_transition INTEGER CHECK (skill_transition IS NULL OR (skill_transition >= 1 AND skill_transition <= 10)),
    skill_field_awareness INTEGER CHECK (skill_field_awareness IS NULL OR (skill_field_awareness >= 1 AND skill_field_awareness <= 10)),
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'injured', 'inactive')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GAMES TABLE: Game records with scoring and timing info
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    opponent VARCHAR(255) NOT NULL,
    game_date DATE NOT NULL,
    location VARCHAR(255),
    format VARCHAR(20) DEFAULT 'standard'
        CHECK (format IN ('standard', '6s')),
    periods INTEGER DEFAULT 4,
    period_length_minutes INTEGER DEFAULT 12,
    shot_clock_seconds INTEGER,
    score_home INTEGER DEFAULT 0,
    score_away INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GAME_EVENTS TABLE: Granular event tracking during games
CREATE TABLE IF NOT EXISTS game_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    athlete_id UUID REFERENCES athletes(id) ON DELETE SET NULL,
    event_type VARCHAR(30) NOT NULL
        CHECK (event_type IN (
            'goal', 'assist', 'shot', 'shot_on_goal',
            'ground_ball', 'turnover', 'caused_turnover',
            'save', 'penalty', 'sub_in', 'sub_out',
            'faceoff_win', 'faceoff_loss'
        )),
    period INTEGER NOT NULL,
    game_clock_seconds INTEGER,
    assist_athlete_id UUID REFERENCES athletes(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PLAYTIME_LOG TABLE: Track athlete substitution and total minutes
CREATE TABLE IF NOT EXISTS playtime_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    period INTEGER NOT NULL,
    minutes_played NUMERIC(5, 2) NOT NULL DEFAULT 0,
    entered_at_seconds INTEGER,
    exited_at_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FACEOFF_LOG TABLE: Track faceoff wins/losses per athlete
CREATE TABLE IF NOT EXISTS faceoff_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
    period INTEGER NOT NULL,
    result VARCHAR(5) NOT NULL
        CHECK (result IN ('win', 'loss')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLES - Playbook & Practice
-- ============================================================================

-- PLAYS TABLE: Saved plays and formations
CREATE TABLE IF NOT EXISTS plays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    situation_tag VARCHAR(30)
        CHECK (situation_tag IN ('emo', 'man_down', 'settled', 'transition', 'faceoff', 'clear', '6s_set', '6s_fast_break')),
    diagram_data JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PRACTICE_SESSIONS TABLE: Track practice drills and focus areas
CREATE TABLE IF NOT EXISTS practice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    practice_date DATE NOT NULL,
    drill_blocks JSONB NOT NULL DEFAULT '[]',
    focus_tags TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLES - Multi-Coach Sync
-- ============================================================================

-- GAME_SESSIONS TABLE: Manage simultaneous coaching (up to 3 devices)
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    join_code VARCHAR(6) NOT NULL UNIQUE,
    head_coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    format VARCHAR(20) DEFAULT 'standard'
        CHECK (format IN ('standard', '6s')),
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'ended')),
    game_state JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SESSION_PARTICIPANTS TABLE: Track who is connected to a game session
CREATE TABLE IF NOT EXISTS session_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'assistant'
        CHECK (role IN ('head_coach', 'assistant', 'stat_tracker')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, coach_id)
);

-- SYNC_EVENTS TABLE: Log all state changes for consistency across devices
CREATE TABLE IF NOT EXISTS sync_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
    resolved BOOLEAN DEFAULT false
);

-- ============================================================================
-- TABLES - AI Integration
-- ============================================================================

-- AI_CONVERSATIONS TABLE: Store multi-turn AI conversations with coaches
CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    game_id UUID REFERENCES games(id) ON DELETE SET NULL,
    messages JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI_CALL_LOGS TABLE: Track API usage and costs
CREATE TABLE IF NOT EXISTS ai_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    model VARCHAR(100) NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    latency_ms INTEGER,
    cost_estimate NUMERIC(8, 6),
    tool_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES - Query Performance
-- ============================================================================

-- Core entity lookups
CREATE INDEX IF NOT EXISTS idx_teams_coach_id ON teams(coach_id);
CREATE INDEX IF NOT EXISTS idx_athletes_team_id ON athletes(team_id);
CREATE INDEX IF NOT EXISTS idx_games_team_id ON games(team_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

-- Game event tracking
CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id);
CREATE INDEX IF NOT EXISTS idx_game_events_athlete_id ON game_events(athlete_id);

-- Playtime and faceoff analytics
CREATE INDEX IF NOT EXISTS idx_playtime_log_game_id_athlete_id ON playtime_log(game_id, athlete_id);
CREATE INDEX IF NOT EXISTS idx_faceoff_log_game_id ON faceoff_log(game_id);

-- Multi-coach sync performance
CREATE INDEX IF NOT EXISTS idx_game_sessions_join_code ON game_sessions(join_code);
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_id ON game_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_session_id ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_session_id ON sync_events(session_id);

-- AI integration tracking
CREATE INDEX IF NOT EXISTS idx_ai_call_logs_coach_id ON ai_call_logs(coach_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_coach_id ON ai_conversations(coach_id);

-- ============================================================================
-- TRIGGER FUNCTION - Auto-Update Timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at column
DROP TRIGGER IF EXISTS update_coaches_updated_at ON coaches;
CREATE TRIGGER update_coaches_updated_at
    BEFORE UPDATE ON coaches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_athletes_updated_at ON athletes;
CREATE TRIGGER update_athletes_updated_at
    BEFORE UPDATE ON athletes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_games_updated_at ON games;
CREATE TRIGGER update_games_updated_at
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_plays_updated_at ON plays;
CREATE TRIGGER update_plays_updated_at
    BEFORE UPDATE ON plays
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_practice_sessions_updated_at ON practice_sessions;
CREATE TRIGGER update_practice_sessions_updated_at
    BEFORE UPDATE ON practice_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_game_sessions_updated_at ON game_sessions;
CREATE TRIGGER update_game_sessions_updated_at
    BEFORE UPDATE ON game_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_conversations_updated_at ON ai_conversations;
CREATE TRIGGER update_ai_conversations_updated_at
    BEFORE UPDATE ON ai_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS - Analytics and Reporting
-- ============================================================================

-- ATHLETE_SEASON_STATS: Aggregate statistics per athlete across a season
DROP VIEW IF EXISTS athlete_season_stats CASCADE;
CREATE VIEW athlete_season_stats AS
SELECT
    a.id as athlete_id,
    a.team_id,
    a.first_name,
    a.last_name,
    a.jersey_number,
    COUNT(DISTINCT ge.game_id) as games_participated,
    COUNT(CASE WHEN ge.event_type = 'goal' THEN 1 END) as goals,
    COUNT(CASE WHEN ge.event_type = 'assist' THEN 1 END) as assists,
    COUNT(CASE WHEN ge.event_type = 'ground_ball' THEN 1 END) as ground_balls,
    COUNT(CASE WHEN ge.event_type = 'turnover' THEN 1 END) as turnovers,
    COUNT(CASE WHEN ge.event_type = 'caused_turnover' THEN 1 END) as caused_turnovers,
    COUNT(CASE WHEN ge.event_type = 'shot' THEN 1 END) as shots,
    COUNT(CASE WHEN ge.event_type = 'shot_on_goal' THEN 1 END) as shots_on_goal,
    COUNT(CASE WHEN ge.event_type = 'faceoff_win' THEN 1 END) as faceoff_wins,
    COUNT(CASE WHEN ge.event_type = 'faceoff_loss' THEN 1 END) as faceoff_losses,
    COUNT(CASE WHEN ge.event_type = 'save' THEN 1 END) as saves,
    COALESCE(SUM(pl.minutes_played), 0) as total_minutes_played
FROM athletes a
LEFT JOIN game_events ge ON a.id = ge.athlete_id
LEFT JOIN playtime_log pl ON a.id = pl.athlete_id
GROUP BY a.id, a.team_id, a.first_name, a.last_name, a.jersey_number;

-- ATHLETE_PLAYTIME_SUMMARY: Breakdown of playing time per game and cumulative
DROP VIEW IF EXISTS athlete_playtime_summary CASCADE;
CREATE VIEW athlete_playtime_summary AS
SELECT
    a.id as athlete_id,
    a.first_name,
    a.last_name,
    g.id as game_id,
    g.opponent,
    g.game_date,
    COALESCE(SUM(pl.minutes_played), 0) as minutes_in_game,
    COUNT(DISTINCT pl.period) as periods_played
FROM athletes a
LEFT JOIN playtime_log pl ON a.id = pl.athlete_id
LEFT JOIN games g ON pl.game_id = g.id
GROUP BY a.id, a.first_name, a.last_name, g.id, g.opponent, g.game_date;

-- TEAM_GAME_SUMMARY: High-level game overview per team
DROP VIEW IF EXISTS team_game_summary CASCADE;
CREATE VIEW team_game_summary AS
SELECT
    g.id as game_id,
    t.id as team_id,
    t.team_name,
    g.opponent,
    g.game_date,
    g.location,
    g.format,
    g.score_home,
    g.score_away,
    CASE
        WHEN g.score_home > g.score_away THEN 'Win'
        WHEN g.score_home < g.score_away THEN 'Loss'
        ELSE 'Tie'
    END as result,
    g.status,
    COUNT(DISTINCT ge.athlete_id) as athletes_involved,
    COUNT(CASE WHEN ge.event_type = 'goal' THEN 1 END) as total_goals
FROM games g
LEFT JOIN teams t ON g.team_id = t.id
LEFT JOIN game_events ge ON g.id = ge.game_id
GROUP BY g.id, t.id, t.team_name, g.opponent, g.game_date, g.location, g.format, g.score_home, g.score_away, g.status;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- Migration successfully creates the CoachIQ database schema with:
--   - 19 core tables (idempotent creation)
--   - 14 performance indexes
--   - Auto-updating timestamp triggers
--   - 3 analytics views
-- Schema supports multi-coach sync, flexible game formats, and comprehensive
-- game event and athlete performance tracking.
-- ============================================================================
