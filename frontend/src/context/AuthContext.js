import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../config/api';

const AuthContext = createContext(null);

/**
 * AuthProvider — wraps the app and provides:
 *   - coach: { id, email, firstName, lastName, subscriptionTier }
 *   - team:  { id, teamName, season, gameFormat, logoUrl, primaryColor }
 *   - isAuthenticated: boolean
 *   - isLoading: boolean (true while checking stored token)
 *   - login(email, password): Promise — stores token, populates coach + team
 *   - logout(): clears state + localStorage
 *   - setActiveTeam(team): switch active team for multi-team coaches
 *   - refreshTeam(): re-fetches current team data from API (after settings save)
 *   - updateTeam(fields): optimistic update to team state
 */
export function AuthProvider({ children }) {
  const [coach, setCoach]         = useState(null);
  const [team, setTeam]           = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: rehydrate from stored token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    apiClient.get('/auth/me')
      .then(res => {
        setCoach(res.data.coach);
        if (res.data.teams?.length > 0) {
          const savedTeamId = localStorage.getItem('activeTeamId');
          const active = res.data.teams.find(t => String(t.id) === savedTeamId) || res.data.teams[0];
          setTeam(normalizeTeam(active));
        }
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('activeTeamId');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await apiClient.post('/auth/login', { email, password });
    const { coach: coachData, token, refreshToken, teams } = res.data;

    localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);

    setCoach(coachData);
    if (teams?.length > 0) {
      setTeam(normalizeTeam(teams[0]));
      localStorage.setItem('activeTeamId', teams[0].id);
    }

    return res.data;
  }, []);

  /**
   * register — create a new coach account. Mirrors login() in that it stores
   * the returned token, populates coach + (optional) team, and returns the
   * raw response so callers can route based on whether a team was created.
   *
   * Fields matched to the backend /auth/register endpoint: email, password,
   * firstName, lastName, teamName (all optional except email + password).
   */
  const register = useCallback(async ({ email, password, firstName, lastName, teamName }) => {
    const res = await apiClient.post('/auth/register', {
      email,
      password,
      firstName,
      lastName,
      teamName,
    });
    const { coach: coachData, token, refreshToken, teams } = res.data;

    localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);

    setCoach(coachData);
    if (teams?.length > 0) {
      setTeam(normalizeTeam(teams[0]));
      localStorage.setItem('activeTeamId', teams[0].id);
    }

    return res.data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('activeTeamId');
    setCoach(null);
    setTeam(null);
  }, []);

  const setActiveTeam = useCallback((t) => {
    setTeam(normalizeTeam(t));
    localStorage.setItem('activeTeamId', t.id);
  }, []);

  /** Optimistic update — merge partial fields into current team state */
  const updateTeam = useCallback((fields) => {
    setTeam(prev => prev ? { ...prev, ...fields } : prev);
  }, []);

  /** Re-fetch the current team from the API (call after PATCH /teams/:id or logo upload) */
  const refreshTeam = useCallback(async () => {
    const id = team?.id || localStorage.getItem('activeTeamId');
    if (!id) return;
    try {
      const res = await apiClient.get(`/teams/${id}`);
      setTeam(normalizeTeam(res.data.team));
    } catch (err) {
      // Silently ignore — stale data is better than a crash
    }
  }, [team?.id]);

  return (
    <AuthContext.Provider value={{
      coach,
      team,
      isAuthenticated: !!coach,
      isLoading,
      login,
      register,
      logout,
      setActiveTeam,
      updateTeam,
      refreshTeam,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize snake_case API fields to camelCase for the team object.
 * API returns: team_name, logo_url, primary_color, game_format, sport_type
 */
function normalizeTeam(t) {
  if (!t) return t;
  return {
    id:           t.id,
    teamName:     t.team_name  ?? t.teamName,
    season:       t.season,
    sportType:    t.sport_type ?? t.sportType,
    gameFormat:   t.game_format ?? t.gameFormat,
    logoUrl:      t.logo_url   ?? t.logoUrl  ?? null,
    primaryColor: t.primary_color ?? t.primaryColor ?? null,
  };
}
