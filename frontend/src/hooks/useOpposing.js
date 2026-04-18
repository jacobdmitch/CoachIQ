import { useState, useEffect, useCallback } from 'react';
import apiClient from '../config/api';

/**
 * useOpposingScouting — combined hook for the pre-game scouting tab.
 *
 * Given (teamId, initialOpposingTeamId) it tracks:
 *   - the opposing team selection (linked to the game)
 *   - the opposing roster
 *   - per-player film stats keyed by opposing_player_id
 *
 * It exposes the operations the film-session UI needs:
 *   - lookupOpposingTeam(name)      → find-or-create by name, sets selection
 *   - bulkAddPlayers(players)       → create roster in one call
 *   - addPlayer / updatePlayer      → single-row edits
 *   - saveFilmStats(playerId, data) → upsert per-player film totals
 *
 * The hook is intentionally minimal — it doesn't fetch the full list of
 * opposing teams a coach has scouted, because the lookup flow is keyed by
 * opponent name (which the game already has) and that's faster than picking
 * from a list.
 */
export function useOpposingScouting(teamId, initialOpposingTeamId) {
  const [opposingTeam, setOpposingTeam] = useState(null);
  const [players,      setPlayers]      = useState([]);
  const [filmStatsMap, setFilmStatsMap] = useState({}); // opposing_player_id -> row
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  const loadTeam = useCallback(async (opposingTeamId) => {
    if (!opposingTeamId) {
      setOpposingTeam(null);
      setPlayers([]);
      setFilmStatsMap({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rostRes, filmRes] = await Promise.all([
        apiClient.get('/opposing/players', { params: { opposingTeamId } }),
        apiClient.get(`/opposing/teams/${opposingTeamId}/film-stats`),
      ]);
      setPlayers(rostRes.data.opposingPlayers || []);
      const map = {};
      for (const row of filmRes.data.filmStats || []) {
        map[row.opposing_player_id] = row;
      }
      setFilmStatsMap(map);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load scouting data.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Hydrate when an id is provided/changes
  useEffect(() => {
    if (!initialOpposingTeamId) return;
    // Fetch the team row itself too so the UI can show the name + notes.
    (async () => {
      try {
        const res = await apiClient.get('/opposing/teams', { params: { teamId } });
        const match = (res.data.opposingTeams || []).find(t => t.id === initialOpposingTeamId);
        setOpposingTeam(match || null);
      } catch {
        // non-fatal — we can still operate without the name
      }
      await loadTeam(initialOpposingTeamId);
    })();
  }, [teamId, initialOpposingTeamId, loadTeam]);

  const lookupOpposingTeam = useCallback(async (name) => {
    if (!teamId || !name?.trim()) return null;
    const res = await apiClient.post('/opposing/teams/lookup', {
      teamId, name: name.trim(),
    });
    const team = res.data.opposingTeam;
    setOpposingTeam(team);
    await loadTeam(team.id);
    return team;
  }, [teamId, loadTeam]);

  const bulkAddPlayers = useCallback(async (newPlayers) => {
    if (!opposingTeam) throw new Error('No opposing team selected');
    const res = await apiClient.post('/opposing/players/bulk', {
      opposingTeamId: opposingTeam.id,
      players: newPlayers,
    });
    setPlayers(res.data.opposingPlayers || []);
    return res.data;
  }, [opposingTeam]);

  const addPlayer = useCallback(async (data) => {
    if (!opposingTeam) throw new Error('No opposing team selected');
    const res = await apiClient.post('/opposing/players', {
      opposingTeamId: opposingTeam.id, ...data,
    });
    setPlayers(prev => [...prev, res.data.opposingPlayer]
      .sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999)));
    return res.data.opposingPlayer;
  }, [opposingTeam]);

  const updatePlayer = useCallback(async (id, data) => {
    const res = await apiClient.patch(`/opposing/players/${id}`, data);
    if (res.data.opposingPlayer) {
      setPlayers(prev => prev.map(p => p.id === id ? res.data.opposingPlayer : p));
    }
    return res.data.opposingPlayer;
  }, []);

  const removePlayer = useCallback(async (id) => {
    await apiClient.delete(`/opposing/players/${id}`);
    setPlayers(prev => prev.filter(p => p.id !== id));
    setFilmStatsMap(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const saveFilmStats = useCallback(async (opposingPlayerId, data) => {
    const res = await apiClient.put(
      `/opposing/players/${opposingPlayerId}/film-stats`, data
    );
    setFilmStatsMap(prev => ({ ...prev, [opposingPlayerId]: res.data.filmStats }));
    return res.data.filmStats;
  }, []);

  return {
    opposingTeam,
    players,
    filmStatsMap,
    loading,
    error,
    lookupOpposingTeam,
    bulkAddPlayers,
    addPlayer,
    updatePlayer,
    removePlayer,
    saveFilmStats,
  };
}
