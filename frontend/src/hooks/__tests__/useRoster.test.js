import { renderHook, waitFor, act } from '@testing-library/react';
import { useRoster, useAthlete } from '../useRoster';

jest.mock('../../config/api', () => ({
  __esModule: true,
  default: {
    get:    jest.fn(),
    post:   jest.fn(),
    put:    jest.fn(),
    patch:  jest.fn(),
    delete: jest.fn(),
  },
}));
import apiClient from '../../config/api';

const TEAM_ID = 'team-1';

beforeEach(() => {
  apiClient.get.mockReset();
  apiClient.post.mockReset();
  apiClient.patch.mockReset();
  apiClient.delete.mockReset();
});

// ─── useRoster ──────────────────────────────────────────────────────────────

describe('useRoster: load', () => {
  test('fetches athletes on mount when teamId is provided', async () => {
    const athletes = [
      { id: 'a1', first_name: 'Jane', last_name: 'Doe', primary_position: 'Midfield' },
    ];
    apiClient.get.mockResolvedValueOnce({ data: { athletes } });

    const { result } = renderHook(() => useRoster(TEAM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiClient.get).toHaveBeenCalledWith('/athletes', { params: { teamId: TEAM_ID } });
    expect(result.current.athletes).toEqual(athletes);
    expect(result.current.error).toBeNull();
  });

  test('does not fetch when teamId is falsy', async () => {
    renderHook(() => useRoster(null));
    await waitFor(() => expect(apiClient.get).not.toHaveBeenCalled());
  });

  test('captures server error body on failure', async () => {
    apiClient.get.mockRejectedValueOnce({ response: { data: { error: 'Team not found' } } });
    const { result } = renderHook(() => useRoster(TEAM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Team not found');
  });

  test('falls back to generic message when server gives no body', async () => {
    apiClient.get.mockRejectedValueOnce(new Error('Network down'));
    const { result } = renderHook(() => useRoster(TEAM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load roster.');
  });
});

describe('useRoster: addAthlete', () => {
  test('POSTs with teamId and refreshes the list', async () => {
    apiClient.get.mockResolvedValueOnce({ data: { athletes: [] } });
    const { result } = renderHook(() => useRoster(TEAM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const created = { id: 'a1', first_name: 'Jane', last_name: 'Doe', primary_position: 'Midfield' };
    apiClient.post.mockResolvedValueOnce({ data: { athlete: created } });
    // Second GET triggered by refresh() inside addAthlete.
    apiClient.get.mockResolvedValueOnce({ data: { athletes: [created] } });

    await act(async () => {
      await result.current.addAthlete({ firstName: 'Jane', lastName: 'Doe', primaryPosition: 'Midfield' });
    });

    expect(apiClient.post).toHaveBeenCalledWith('/athletes', {
      firstName: 'Jane', lastName: 'Doe', primaryPosition: 'Midfield', teamId: TEAM_ID,
    });
    expect(result.current.athletes).toEqual([created]);
  });
});

describe('useRoster: updateAthlete', () => {
  test('PATCHes and replaces the athlete in state', async () => {
    const original = { id: 'a1', first_name: 'Jane', last_name: 'Doe', primary_position: 'Midfield' };
    const updated  = { id: 'a1', first_name: 'Jane', last_name: 'Doe', primary_position: 'Attack' };
    apiClient.get.mockResolvedValueOnce({ data: { athletes: [original] } });
    const { result } = renderHook(() => useRoster(TEAM_ID));
    await waitFor(() => expect(result.current.athletes).toEqual([original]));

    apiClient.patch.mockResolvedValueOnce({ data: { athlete: updated } });
    await act(async () => {
      await result.current.updateAthlete('a1', { primaryPosition: 'Attack' });
    });

    expect(apiClient.patch).toHaveBeenCalledWith('/athletes/a1', { primaryPosition: 'Attack' });
    expect(result.current.athletes).toEqual([updated]);
  });
});

describe('useRoster: removeAthlete', () => {
  test('DELETEs and filters the athlete out of state', async () => {
    const athletes = [
      { id: 'a1', first_name: 'Jane' },
      { id: 'a2', first_name: 'Ava'  },
    ];
    apiClient.get.mockResolvedValueOnce({ data: { athletes } });
    const { result } = renderHook(() => useRoster(TEAM_ID));
    await waitFor(() => expect(result.current.athletes).toHaveLength(2));

    apiClient.delete.mockResolvedValueOnce({});
    await act(async () => {
      await result.current.removeAthlete('a1');
    });

    expect(apiClient.delete).toHaveBeenCalledWith('/athletes/a1');
    expect(result.current.athletes).toEqual([athletes[1]]);
  });
});

// ─── useAthlete ─────────────────────────────────────────────────────────────

describe('useAthlete', () => {
  test('fetches the single athlete when athleteId is provided', async () => {
    const athlete = { id: 'a1', first_name: 'Jane' };
    apiClient.get.mockResolvedValueOnce({ data: { athlete } });

    const { result } = renderHook(() => useAthlete('a1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiClient.get).toHaveBeenCalledWith('/athletes/a1');
    expect(result.current.athlete).toEqual(athlete);
  });

  test('is a no-op when athleteId is falsy', async () => {
    const { result } = renderHook(() => useAthlete(null));
    await waitFor(() => expect(apiClient.get).not.toHaveBeenCalled());
    expect(result.current.athlete).toBeNull();
  });

  test('reports the server error on fetch failure', async () => {
    apiClient.get.mockRejectedValueOnce({ response: { data: { error: 'Not found' } } });
    const { result } = renderHook(() => useAthlete('missing'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Not found');
  });
});
