import { useState, useEffect, useCallback } from 'react';
import apiClient from '../config/api';

/**
 * useDashboard — fetches season dashboard data for the active team.
 *
 * @param {string} teamId
 * @param {string} [seasonId] — optional; when provided, scopes record, stats,
 *   recent games, top scorers, and playtime to that season. When omitted,
 *   the dashboard falls back to team-wide all-time totals.
 *
 * Returns:
 *   data    — { team, record, stats, roster, recentGames, topScorers, playtimeEquity, playtimeFlags, avgMinutes }
 *   loading — boolean
 *   error   — string | null
 *   refresh — function to re-fetch
 */
export function useDashboard(teamId, seasonId) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const fetch = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/dashboard/season/${teamId}`, {
        params: seasonId ? { seasonId } : {},
      });
      setData(res.data.dashboard);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [teamId, seasonId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refresh: fetch };
}
