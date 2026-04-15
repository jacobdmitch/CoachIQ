import { useState, useEffect, useCallback } from 'react';
import apiClient from '../config/api';

/**
 * useDashboard — fetches season dashboard data for the active team.
 *
 * Returns:
 *   data    — { team, record, stats, roster, recentGames, topScorers }
 *   loading — boolean
 *   error   — string | null
 *   refresh — function to re-fetch
 */
export function useDashboard(teamId) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const fetch = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/dashboard/season/${teamId}`);
      setData(res.data.dashboard);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refresh: fetch };
}
