import { useState, useEffect, useCallback } from 'react';
import apiClient from '../config/api';

/**
 * useRotations — CRUD for line-rotation templates.
 *
 * A rotation is an ordered array of line IDs within one position group that
 * the coach cycles through during a game. The current index (where we are in
 * the rotation for a given game) is intentionally NOT stored server-side —
 * that's per-game client state owned by whatever UI is running the rotation.
 */
export function useRotations(teamId) {
  const [rotations, setRotations] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/lines/rotations`, { params: { teamId } });
      setRotations(res.data.rotations || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const createRotation = useCallback(async ({ name, positionGroup, lineIds }) => {
    const res = await apiClient.post('/lines/rotations', { teamId, name, positionGroup, lineIds });
    setRotations(prev => [...prev, res.data.rotation]);
    return res.data.rotation;
  }, [teamId]);

  const updateRotation = useCallback(async (id, body) => {
    const res = await apiClient.put(`/lines/rotations/${id}`, body);
    setRotations(prev => prev.map(r => r.id === id ? res.data.rotation : r));
    return res.data.rotation;
  }, []);

  const deleteRotation = useCallback(async (id) => {
    await apiClient.delete(`/lines/rotations/${id}`);
    setRotations(prev => prev.filter(r => r.id !== id));
  }, []);

  return { rotations, loading, error, refresh: load, createRotation, updateRotation, deleteRotation };
}
