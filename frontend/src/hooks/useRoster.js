import { useState, useEffect, useCallback } from 'react';
import apiClient from '../config/api';

/**
 * useRoster — fetches and manages the athlete roster for a team.
 *
 * Returns:
 *   athletes  — array of athlete objects
 *   loading   — boolean
 *   error     — string | null
 *   refresh   — re-fetch function
 *   addAthlete(data)    — POST new athlete, refreshes list
 *   updateAthlete(id, data) — PATCH athlete
 *   removeAthlete(id)   — DELETE athlete
 */
export function useRoster(teamId) {
  const [athletes, setAthletes] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/athletes', { params: { teamId } });
      setAthletes(res.data.athletes);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load roster.');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { refresh(); }, [refresh]);

  const addAthlete = useCallback(async (data) => {
    const res = await apiClient.post('/athletes', { ...data, teamId });
    await refresh();
    return res.data.athlete;
  }, [teamId, refresh]);

  const updateAthlete = useCallback(async (id, data) => {
    const res = await apiClient.patch(`/athletes/${id}`, data);
    setAthletes(prev => prev.map(a => a.id === id ? res.data.athlete : a));
    return res.data.athlete;
  }, []);

  const removeAthlete = useCallback(async (id) => {
    await apiClient.delete(`/athletes/${id}`);
    setAthletes(prev => prev.filter(a => a.id !== id));
  }, []);

  return { athletes, loading, error, refresh, addAthlete, updateAthlete, removeAthlete };
}

/**
 * useAthlete — fetches a single athlete by ID.
 */
export function useAthlete(athleteId) {
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!athleteId) return;
    setLoading(true);
    setError(null);
    apiClient.get(`/athletes/${athleteId}`)
      .then(res => setAthlete(res.data.athlete))
      .catch(err => setError(err.response?.data?.error || 'Failed to load athlete.'))
      .finally(() => setLoading(false));
  }, [athleteId]);

  return { athlete, loading, error };
}
