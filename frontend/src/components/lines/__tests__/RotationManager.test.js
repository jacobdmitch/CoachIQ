import React from 'react';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';

// Mock the useRotations hook so RotationManager can be tested in isolation
// from the fetch layer. Each test overrides the mock's return value via
// mockUseRotations.mockReturnValue(...).
const mockUseRotations = jest.fn();
jest.mock('../../../hooks/useRotations', () => ({
  useRotations: (...args) => mockUseRotations(...args),
}));

import RotationManager from '../RotationManager';

const LINES = [
  { id: 'l1', name: 'Midi A', position_group: 'midfield' },
  { id: 'l2', name: 'Midi B', position_group: 'midfield' },
  { id: 'l3', name: 'Midi C', position_group: 'midfield' },
  { id: 'l4', name: 'Attack 1', position_group: 'attack' },
];

function setHook({ rotations = [], createRotation = jest.fn(), deleteRotation = jest.fn() } = {}) {
  mockUseRotations.mockReturnValue({ rotations, createRotation, deleteRotation });
  return { createRotation, deleteRotation };
}

beforeEach(() => {
  mockUseRotations.mockReset();
});

// ─── Empty state ────────────────────────────────────────────────────────────

describe('RotationManager: empty state', () => {
  test('shows the empty-state prompt when there are no rotations', () => {
    setHook({ rotations: [] });
    render(<RotationManager teamId="team-1" lines={LINES} />);
    expect(
      screen.getByText(/No rotation templates yet/i)
    ).toBeInTheDocument();
  });
});

// ─── List rendering ─────────────────────────────────────────────────────────

describe('RotationManager: list rendering', () => {
  test('renders rotation cards with the ordered line names', () => {
    setHook({
      rotations: [
        { id: 'r1', name: 'Midi A/B/C', position_group: 'midfield', line_ids: ['l1', 'l2', 'l3'] },
      ],
    });
    render(<RotationManager teamId="team-1" lines={LINES} />);
    expect(screen.getByText('Midi A/B/C')).toBeInTheDocument();
    expect(screen.getByText(/Midi A → Midi B → Midi C/)).toBeInTheDocument();
  });

  test('groups rotations by position group heading', () => {
    setHook({
      rotations: [
        { id: 'r1', name: 'Midi A/B', position_group: 'midfield', line_ids: ['l1', 'l2'] },
        { id: 'r2', name: 'Attack rotation', position_group: 'attack', line_ids: ['l4'] },
      ],
    });
    render(<RotationManager teamId="team-1" lines={LINES} />);
    expect(screen.getByText('Midfield')).toBeInTheDocument();
    expect(screen.getByText('Attack')).toBeInTheDocument();
    expect(screen.queryByText('Defense')).not.toBeInTheDocument();
  });

  test('shows "?" when a rotation references an unknown line id', () => {
    setHook({
      rotations: [
        { id: 'r1', name: 'Broken', position_group: 'midfield', line_ids: ['l1', 'ghost-line'] },
      ],
    });
    render(<RotationManager teamId="team-1" lines={LINES} />);
    expect(screen.getByText(/Midi A → \?/)).toBeInTheDocument();
  });
});

// ─── New Rotation form toggle + validation ──────────────────────────────────

describe('RotationManager: form', () => {
  test('opens the form when "+ New Rotation" is clicked', () => {
    setHook({ rotations: [] });
    render(<RotationManager teamId="team-1" lines={LINES} />);
    fireEvent.click(screen.getByRole('button', { name: /New Rotation/i }));
    expect(screen.getByPlaceholderText(/Rotation name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Rotation/i })).toBeInTheDocument();
  });

  test('closes the form when Cancel is clicked', () => {
    setHook({ rotations: [] });
    render(<RotationManager teamId="team-1" lines={LINES} />);
    fireEvent.click(screen.getByRole('button', { name: /New Rotation/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByPlaceholderText(/Rotation name/i)).not.toBeInTheDocument();
  });

  test('shows a validation error when submitted without name + two lines', () => {
    setHook({ rotations: [] });
    render(<RotationManager teamId="team-1" lines={LINES} />);
    fireEvent.click(screen.getByRole('button', { name: /New Rotation/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save Rotation/i }));
    expect(screen.getByText(/Name and at least two lines are required/i)).toBeInTheDocument();
  });

  test('happy path: fills out, adds lines, and calls createRotation', async () => {
    const { createRotation } = setHook({ rotations: [] });
    createRotation.mockResolvedValue({});
    render(<RotationManager teamId="team-1" lines={LINES} />);
    fireEvent.click(screen.getByRole('button', { name: /New Rotation/i }));

    fireEvent.change(screen.getByPlaceholderText(/Rotation name/i), { target: { value: 'Midi A/B/C' } });
    // positionGroup default is 'midfield'; eligible lines are l1, l2, l3
    fireEvent.click(screen.getByRole('button', { name: /\+ Midi A/ }));
    fireEvent.click(screen.getByRole('button', { name: /\+ Midi B/ }));
    fireEvent.click(screen.getByRole('button', { name: /\+ Midi C/ }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Rotation/i }));
    });

    expect(createRotation).toHaveBeenCalledWith({
      name: 'Midi A/B/C',
      positionGroup: 'midfield',
      lineIds: ['l1', 'l2', 'l3'],
    });
    // Form should close on success.
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Rotation name/i)).not.toBeInTheDocument();
    });
  });

  test('shows empty-lines hint when selected position group has no saved lines', () => {
    setHook({ rotations: [] });
    render(<RotationManager teamId="team-1" lines={LINES} />);
    fireEvent.click(screen.getByRole('button', { name: /New Rotation/i }));
    // Switch to defense — no defense lines in LINES fixture.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'defense' } });
    expect(screen.getByText(/No saved defense lines yet/i)).toBeInTheDocument();
  });
});

// ─── Delete flow (window.confirm) ───────────────────────────────────────────

describe('RotationManager: delete', () => {
  test('calls deleteRotation when user confirms', () => {
    const { deleteRotation } = setHook({
      rotations: [
        { id: 'r1', name: 'Midi A/B', position_group: 'midfield', line_ids: ['l1', 'l2'] },
      ],
    });
    const spy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<RotationManager teamId="team-1" lines={LINES} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete Midi A\/B/i }));
    expect(deleteRotation).toHaveBeenCalledWith('r1');
    spy.mockRestore();
  });

  test('does NOT call deleteRotation when user cancels confirm', () => {
    const { deleteRotation } = setHook({
      rotations: [
        { id: 'r1', name: 'Midi A/B', position_group: 'midfield', line_ids: ['l1', 'l2'] },
      ],
    });
    const spy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<RotationManager teamId="team-1" lines={LINES} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete Midi A\/B/i }));
    expect(deleteRotation).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
