import { renderHook, waitFor, act } from '@testing-library/react';
import { useLines } from '../useLines';

jest.mock('../../config/api', () => ({
  __esModule: true,
  default: {
    get:    jest.fn(),
    post:   jest.fn(),
    put:    jest.fn(),
    delete: jest.fn(),
  },
}));
import apiClient from '../../config/api';

const TEAM_ID = 'team-1';

beforeEach(() => {
  apiClient.get.mockReset();
  apiClient.post.mockReset();
  apiClient.put.mockReset();
  apiClient.delete.mockReset();
});

describe('useLines: load', () => {
  test('fetches lines on mount when teamId is provided', async () => {
    const lines = [{ id: 'l1', name: 'Line A', position_group: 'midfield', player_ids: ['p1', 'p2', 'p3'] }];
    apiClient.get.mockResolvedValueOnce({ data: { lines } });

    const { result } = renderHook(() => useLines(TEAM_ID));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiClient.get).toHaveBeenCalledWith(`/lines?teamId=${TEAM_ID}`);
    expect(result.current.lines).toEqual(lines);
    expect(result.current.error).toBeNull();
  });

  test('tolerates missing lines array in response body', async () => {
    apiClient.get.mockResolvedValueOnce({ data: {} });
    const { result } = renderHook(() => useLines(TEAM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lines).toEqual([]);
  });

  test('does not fetch when teamId is falsy', async () => {
    const { result } = renderHook(() => useLines(null));
    await waitFor(() => expect(apiClient.get).not.toHaveBeenCalled());
    // loading remains true because the guard returns before setLoading(false).
    // Hook contract: consumers check teamId themselves before reading loading.
    expect(result.current.lines).toEqual([]);
  });

  test('captures server error body on failure', async () => {
    apiClient.get.mockRejectedValueOnce({ response: { data: { error: 'Forbidden' } } });
    const { result } = renderHook(() => useLines(TEAM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Forbidden');
  });
});

describe('useLines: createLine', () => {
  test('POSTs and appends the new line', async () => {
    apiClient.get.mockResolvedValueOnce({ data: { lines: [] } });
    const { result } = renderHook(() => useLines(TEAM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newLine = { id: 'l2', name: 'Defense', position_group: 'defense', player_ids: ['p4', 'p5', 'p6'] };
    apiClient.post.mockResolvedValueOnce({ data: { line: newLine } });

    await act(async () => {
      await result.current.createLine({
        name: 'Defense', positionGroup: 'defense', playerIds: ['p4', 'p5', 'p6'],
      });
    });

    expect(apiClient.post).toHaveBeenCalledWith('/lines', {
      teamId: TEAM_ID, name: 'Defense', positionGroup: 'defense', playerIds: ['p4', 'p5', 'p6'],
    });
    expect(result.current.lines).toEqual([newLine]);
  });
});

describe('useLines: updateLine', () => {
  test('PUTs and replaces the line in state', async () => {
    const original = { id: 'l1', name: 'A', position_group: 'midfield', player_ids: ['p1'] };
    const updated  = { id: 'l1', name: 'A (v2)', position_group: 'midfield', player_ids: ['p1', 'p2'] };
    apiClient.get.mockResolvedValueOnce({ data: { lines: [original] } });
    const { result } = renderHook(() => useLines(TEAM_ID));
    await waitFor(() => expect(result.current.lines).toEqual([original]));

    apiClient.put.mockResolvedValueOnce({ data: { line: updated } });
    await act(async () => {
      await result.current.updateLine('l1', {
        name: 'A (v2)', positionGroup: 'midfield', playerIds: ['p1', 'p2'],
      });
    });

    expect(apiClient.put).toHaveBeenCalledWith('/lines/l1', {
      name: 'A (v2)', positionGroup: 'midfield', playerIds: ['p1', 'p2'],
    });
    expect(result.current.lines).toEqual([updated]);
  });
});

describe('useLines: deleteLine', () => {
  test('DELETEs and removes the line from state', async () => {
    const lines = [
      { id: 'l1', name: 'A', position_group: 'midfield' },
      { id: 'l2', name: 'B', position_group: 'midfield' },
    ];
    apiClient.get.mockResolvedValueOnce({ data: { lines } });
    const { result } = renderHook(() => useLines(TEAM_ID));
    await waitFor(() => expect(result.current.lines).toHaveLength(2));

    apiClient.delete.mockResolvedValueOnce({});
    await act(async () => {
      await result.current.deleteLine('l1');
    });

    expect(apiClient.delete).toHaveBeenCalledWith('/lines/l1');
    expect(result.current.lines).toEqual([lines[1]]);
  });
});
