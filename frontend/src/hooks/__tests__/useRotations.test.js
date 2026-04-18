import { renderHook, waitFor, act } from '@testing-library/react';
import { useRotations } from '../useRotations';

// Replace the apiClient module with a jest mock. Must be declared before the
// hook under test is imported; jest hoists the mock factory to the top.
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

describe('useRotations: load', () => {
  test('fetches rotations on mount when teamId is provided', async () => {
    const rotations = [
      { id: 'r1', name: 'Midi A/B', position_group: 'midfield', line_ids: ['l1', 'l2'] },
    ];
    apiClient.get.mockResolvedValueOnce({ data: { rotations } });

    const { result } = renderHook(() => useRotations(TEAM_ID));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiClient.get).toHaveBeenCalledWith('/lines/rotations', { params: { teamId: TEAM_ID } });
    expect(result.current.rotations).toEqual(rotations);
    expect(result.current.error).toBeNull();
  });

  test('does not fetch when teamId is falsy', async () => {
    const { result } = renderHook(() => useRotations(null));
    // Let any pending microtasks resolve.
    await waitFor(() => expect(apiClient.get).not.toHaveBeenCalled());
    expect(result.current.rotations).toEqual([]);
  });

  test('captures the server error message on fetch failure', async () => {
    apiClient.get.mockRejectedValueOnce({
      response: { data: { error: 'Team not found' } },
    });

    const { result } = renderHook(() => useRotations(TEAM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Team not found');
  });

  test('falls back to err.message when server gives no body', async () => {
    apiClient.get.mockRejectedValueOnce(new Error('Network down'));
    const { result } = renderHook(() => useRotations(TEAM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network down');
  });
});

describe('useRotations: createRotation', () => {
  test('POSTs and appends the new rotation to state', async () => {
    apiClient.get.mockResolvedValueOnce({ data: { rotations: [] } });
    const { result } = renderHook(() => useRotations(TEAM_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newRotation = { id: 'r2', name: 'Defense', position_group: 'defense', line_ids: ['l3', 'l4'] };
    apiClient.post.mockResolvedValueOnce({ data: { rotation: newRotation } });

    await act(async () => {
      await result.current.createRotation({
        name: 'Defense', positionGroup: 'defense', lineIds: ['l3', 'l4'],
      });
    });

    expect(apiClient.post).toHaveBeenCalledWith('/lines/rotations', {
      teamId: TEAM_ID, name: 'Defense', positionGroup: 'defense', lineIds: ['l3', 'l4'],
    });
    expect(result.current.rotations).toEqual([newRotation]);
  });
});

describe('useRotations: deleteRotation', () => {
  test('removes the rotation from state after successful delete', async () => {
    const rotations = [
      { id: 'r1', name: 'A', position_group: 'midfield', line_ids: ['l1', 'l2'] },
      { id: 'r2', name: 'B', position_group: 'midfield', line_ids: ['l3', 'l4'] },
    ];
    apiClient.get.mockResolvedValueOnce({ data: { rotations } });
    const { result } = renderHook(() => useRotations(TEAM_ID));
    await waitFor(() => expect(result.current.rotations).toHaveLength(2));

    apiClient.delete.mockResolvedValueOnce({});

    await act(async () => {
      await result.current.deleteRotation('r1');
    });

    expect(apiClient.delete).toHaveBeenCalledWith('/lines/rotations/r1');
    expect(result.current.rotations).toEqual([rotations[1]]);
  });
});

describe('useRotations: updateRotation', () => {
  test('replaces the rotation in state with the server response', async () => {
    const original = { id: 'r1', name: 'A', position_group: 'midfield', line_ids: ['l1', 'l2'] };
    const updated  = { id: 'r1', name: 'A (renamed)', position_group: 'midfield', line_ids: ['l1', 'l2'] };
    apiClient.get.mockResolvedValueOnce({ data: { rotations: [original] } });
    const { result } = renderHook(() => useRotations(TEAM_ID));
    await waitFor(() => expect(result.current.rotations).toEqual([original]));

    apiClient.put.mockResolvedValueOnce({ data: { rotation: updated } });
    await act(async () => {
      await result.current.updateRotation('r1', { name: 'A (renamed)' });
    });

    expect(apiClient.put).toHaveBeenCalledWith('/lines/rotations/r1', { name: 'A (renamed)' });
    expect(result.current.rotations).toEqual([updated]);
  });
});
