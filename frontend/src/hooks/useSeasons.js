import { useState, useEffect, useCallback } from 'react';
import apiClient from '../config/api';

/**
 * useSeasons — fetches the seasons list for a team.
 *
 * @param {string} teamId
 * @param {object} [opts]
 * @param {boolean} [opts.withGamesOnly] — if true, only return seasons that
 *   have at least one game attached (used by the season picker).
 */
export function useSeasons(teamId, opts = {}) {
  const { withGamesOnly = false } = opts;
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const refresh = useCallback(async () => {
    if (!teamId) { setSeasons([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/seasons', {
        params: { teamId, ...(withGamesOnly ? { withGamesOnly: true } : {}) },
      });
      setSeasons(res.data.seasons);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load seasons.');
    } finally {
      setLoading(false);
    }
  }, [teamId, withGamesOnly]);

  useEffect(() => { refresh(); }, [refresh]);

  const createSeason = useCallback(async ({ name, startDate, endDate }) => {
    const res = await apiClient.post('/seasons', {
      teamId, name, startDate, endDate,
    });
    await refresh();
    return res.data.season;
  }, [teamId, refresh]);

  const updateSeason = useCallback(async (id, data) => {
    const res = await apiClient.patch(`/seasons/${id}`, data);
    setSeasons(prev => prev.map(s => s.id === id ? res.data.season : s));
    return res.data.season;
  }, []);

  const deleteSeason = useCallback(async (id) => {
    await apiClient.delete(`/seasons/${id}`);
    setSeasons(prev => prev.filter(s => s.id !== id));
  }, []);

  return { seasons, loading, error, refresh, createSeason, updateSeason, deleteSeason };
}
