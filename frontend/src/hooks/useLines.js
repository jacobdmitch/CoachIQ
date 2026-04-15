import { useState, useEffect, useCallback } from 'react';
import apiClient from '../config/api';

/**
 * useLines — CRUD for saved team lines (reusable player groupings).
 * @param {string} teamId
 */
export function useLines(teamId) {
  const [lines,   setLines]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/lines?teamId=${teamId}`);
      setLines(res.data.lines || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const createLine = useCallback(async ({ name, positionGroup, playerIds }) => {
    const res = await apiClient.post('/lines', { teamId, name, positionGroup, playerIds });
    setLines(prev => [...prev, res.data.line]);
    return res.data.line;
  }, [teamId]);

  const updateLine = useCallback(async (lineId, { name, positionGroup, playerIds }) => {
    const res = await apiClient.put(`/lines/${lineId}`, { name, positionGroup, playerIds });
    setLines(prev => prev.map(l => l.id === lineId ? res.data.line : l));
    return res.data.line;
  }, []);

  const deleteLine = useCallback(async (lineId) => {
    await apiClient.delete(`/lines/${lineId}`);
    setLines(prev => prev.filter(l => l.id !== lineId));
  }, []);

  return { lines, loading, error, refresh: load, createLine, updateLine, deleteLine };
}
