import { useState, useEffect, useCallback } from 'react';
import apiClient from '../config/api';

/**
 * useGames — fetches the game list for a team.
 */
export function useGames(teamId, status) {
  const [games,   setGames]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const params = { teamId };
      if (status) params.status = status;
      const res = await apiClient.get('/games', { params });
      setGames(res.data.games);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load games.');
    } finally {
      setLoading(false);
    }
  }, [teamId, status]);

  useEffect(() => { refresh(); }, [refresh]);

  const scheduleGame = useCallback(async (data) => {
    const res = await apiClient.post('/games', { ...data, teamId });
    await refresh();
    return res.data.game;
  }, [teamId, refresh]);

  const updateGame = useCallback(async (id, data) => {
    const res = await apiClient.patch(`/games/${id}`, data);
    setGames(prev => prev.map(g => g.id === id ? res.data.game : g));
    return res.data.game;
  }, []);

  return { games, loading, error, refresh, scheduleGame, updateGame };
}

/**
 * useGame — fetches and manages a single game.
 */
export function useGame(gameId) {
  const [game,    setGame]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/games/${gameId}`);
      setGame(res.data.game);
    } catch (err) {
      setError(err.response?.data?.error || 'Game not found.');
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateScore = useCallback(async (scoreHome, scoreAway) => {
    if (!gameId) return;
    const res = await apiClient.patch(`/games/${gameId}`, { scoreHome, scoreAway });
    setGame(res.data.game);
  }, [gameId]);

  const updateStatus = useCallback(async (status) => {
    if (!gameId) return;
    const res = await apiClient.patch(`/games/${gameId}`, { status });
    setGame(res.data.game);
  }, [gameId]);

  return { game, loading, error, refresh, updateScore, updateStatus };
}
