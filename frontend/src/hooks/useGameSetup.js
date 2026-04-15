import { useState, useEffect, useCallback } from 'react';
import apiClient from '../config/api';

/**
 * useGameSetup — manages pre-game lineup and situation assignment state.
 *
 * Used by the GameSetup component before a game is activated.
 * Handles:
 *  - Fetching the roster for the game's team
 *  - Local lineup state (position → athleteId map)
 *  - Situation assignments (saving/loading per-game situation player sets)
 *  - Starting the game with the configured lineup
 */
export function useGameSetup(game) {
  const [athletes,    setAthletes]    = useState([]);
  const [lineup,      setLineup]      = useState({});     // position → athleteId
  const [assignments, setAssignments] = useState({});     // situationType → athleteId[]
  const [loading,     setLoading]     = useState(true);
  const [starting,    setStarting]    = useState(false);
  const [error,       setError]       = useState(null);

  // ── Load roster and any existing situation assignments ────────────────────

  useEffect(() => {
    if (!game?.id || !game?.team_id) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [rosterRes, assignRes] = await Promise.all([
          apiClient.get(`/athletes?teamId=${game.team_id}`),
          apiClient.get(`/games/${game.id}/situation-assignments`),
        ]);

        setAthletes(rosterRes.data.athletes || []);

        // Pre-populate lineup if game already has one saved
        if (game.starting_lineup) {
          setLineup(game.starting_lineup);
        }

        // Index assignments by situation_type
        const assignMap = {};
        for (const a of (assignRes.data.assignments || [])) {
          assignMap[a.situation_type] = a.player_ids;
        }
        setAssignments(assignMap);
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [game?.id, game?.team_id]);

  // ── Lineup helpers ────────────────────────────────────────────────────────

  const assignToPosition = useCallback((position, athleteId) => {
    setLineup(prev => {
      const next = { ...prev };
      // Clear any other position that had this athlete
      for (const pos of Object.keys(next)) {
        if (next[pos] === athleteId) delete next[pos];
      }
      if (athleteId) {
        next[position] = athleteId;
      } else {
        delete next[position];
      }
      return next;
    });
  }, []);

  const clearPosition = useCallback((position) => {
    setLineup(prev => {
      const next = { ...prev };
      delete next[position];
      return next;
    });
  }, []);

  // ── Situation assignment helpers ──────────────────────────────────────────

  const saveSituationAssignment = useCallback(async (situationType, playerIds) => {
    if (!game?.id) return;
    try {
      await apiClient.put(
        `/games/${game.id}/situation-assignments/${situationType}`,
        { playerIds }
      );
      setAssignments(prev => ({ ...prev, [situationType]: playerIds }));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, [game?.id]);

  const clearSituationAssignment = useCallback(async (situationType) => {
    if (!game?.id) return;
    try {
      await apiClient.delete(`/games/${game.id}/situation-assignments/${situationType}`);
      setAssignments(prev => {
        const next = { ...prev };
        delete next[situationType];
        return next;
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, [game?.id]);

  // ── Start game ────────────────────────────────────────────────────────────

  const startGame = useCallback(async () => {
    if (!game?.id) return null;
    setStarting(true);
    setError(null);
    try {
      const res = await apiClient.post(`/game-live/${game.id}/start`, {
        startingLineup: lineup,
      });
      return res.data;
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      return null;
    } finally {
      setStarting(false);
    }
  }, [game?.id, lineup]);

  return {
    athletes,
    lineup,
    assignments,
    loading,
    starting,
    error,
    assignToPosition,
    clearPosition,
    saveSituationAssignment,
    clearSituationAssignment,
    startGame,
  };
}
