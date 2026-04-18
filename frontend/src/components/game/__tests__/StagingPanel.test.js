import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import StagingPanel from '../StagingPanel';

/**
 * StagingPanel is a complex component (line/individual/situation pickers,
 * modals, merge alerts). This suite is a SMOKE LAYER — it verifies the
 * top-level render paths that drive the outer panel:
 *
 *   - empty queue renders "No subs staged"
 *   - queue with entries renders an "Activate All" button
 *   - rotations render in a Next Up section
 *   - tapping a rotation queues the correct line and advances the cursor
 *   - add-to-queue mode buttons are present
 *
 * It does NOT exercise the inner modal flows — those have their own cost
 * to test and their core logic (situation resolver) is covered by the
 * backend service test suite.
 */

const ATHLETES = [
  { id: 'a1', first_name: 'Jane', last_name: 'Doe',   jersey_number: 1 },
  { id: 'a2', first_name: 'Ava',  last_name: 'Li',    jersey_number: 2 },
  { id: 'a3', first_name: 'Mia',  last_name: 'Park',  jersey_number: 3 },
  { id: 'a4', first_name: 'Sam',  last_name: 'Ruiz',  jersey_number: 4 },
  { id: 'a5', first_name: 'Kai',  last_name: 'Chen',  jersey_number: 5 },
];
const LINES = [
  { id: 'l1', name: 'Midi A', position_group: 'midfield', player_ids: ['a1', 'a2', 'a3'] },
  { id: 'l2', name: 'Midi B', position_group: 'midfield', player_ids: ['a3', 'a4', 'a5'] },
];

function makeLiveState(overrides = {}) {
  return {
    fieldPositions: { goalie: 'a1', m1: 'a2', m2: 'a3' },
    bench: ['a4', 'a5'],
    subQueue: [],
    ...overrides,
  };
}

function baseProps(overrides = {}) {
  return {
    gameId: 'game-1',
    gameFormat: '10s',
    liveState: makeLiveState(),
    athletes: ATHLETES,
    lines: LINES,
    rotations: [],
    mergeAlerts: [],
    onAddToQueue:        jest.fn(),
    onRemoveEntry:       jest.fn(),
    onRemoveMove:        jest.fn(),
    onActivate:          jest.fn(),
    activating:          false,
    onAutoGenerateLines: jest.fn(),
    ...overrides,
  };
}

describe('StagingPanel: empty queue', () => {
  test('renders "No subs staged" when the queue is empty', () => {
    render(<StagingPanel {...baseProps()} />);
    expect(screen.getByText(/No subs staged/i)).toBeInTheDocument();
  });

  test('does NOT render the Activate All button when the queue is empty', () => {
    render(<StagingPanel {...baseProps()} />);
    expect(screen.queryByRole('button', { name: /Activate All/i })).not.toBeInTheDocument();
  });

  test('renders the add-to-queue mode buttons', () => {
    render(<StagingPanel {...baseProps()} />);
    expect(screen.getByRole('button', { name: /\+ Sub/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /⇄ Line/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /▶ Situation/ })).toBeInTheDocument();
  });
});

describe('StagingPanel: populated queue', () => {
  test('renders the move count and Activate All when queue has entries', () => {
    const liveState = makeLiveState({
      subQueue: [
        {
          queueId: 'q1',
          type: 'individual',
          source: 'manual',
          moves: [{ moveId: 'm1', playerIn: 'a4', playerOut: 'a2', position: 'm1' }],
        },
      ],
    });
    render(<StagingPanel {...baseProps({ liveState })} />);
    expect(screen.getByText(/Staged Subs · 1 move/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Activate All/i })).toBeInTheDocument();
  });

  test('pluralizes "moves" correctly when there are more than one', () => {
    const liveState = makeLiveState({
      subQueue: [{
        queueId: 'q1', type: 'individual', source: 'manual',
        moves: [
          { moveId: 'm1', playerIn: 'a4', playerOut: 'a2', position: 'm1' },
          { moveId: 'm2', playerIn: 'a5', playerOut: 'a3', position: 'm2' },
        ],
      }],
    });
    render(<StagingPanel {...baseProps({ liveState })} />);
    expect(screen.getByText(/Staged Subs · 2 moves/)).toBeInTheDocument();
  });

  test('Activate All button calls onActivate', () => {
    const liveState = makeLiveState({
      subQueue: [{
        queueId: 'q1', type: 'individual', source: 'manual',
        moves: [{ moveId: 'm1', playerIn: 'a4', playerOut: 'a2', position: 'm1' }],
      }],
    });
    const props = baseProps({ liveState });
    render(<StagingPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Activate All/i }));
    expect(props.onActivate).toHaveBeenCalled();
  });
});

describe('StagingPanel: rotations', () => {
  const rotations = [
    {
      id: 'rot-1',
      name: 'Midi A/B',
      position_group: 'midfield',
      line_ids: ['l1', 'l2'],
    },
  ];

  test('renders the Next Up section only when rotations exist', () => {
    const { rerender } = render(<StagingPanel {...baseProps({ rotations: [] })} />);
    expect(screen.queryByText(/Next Up/i)).not.toBeInTheDocument();
    rerender(<StagingPanel {...baseProps({ rotations })} />);
    expect(screen.getByText(/Next Up/i)).toBeInTheDocument();
    expect(screen.getByText(/Midi A\/B · Midi A/)).toBeInTheDocument();
  });

  test('tapping a rotation queues the current line and advances the cursor', () => {
    const props = baseProps({ rotations });
    const { rerender } = render(<StagingPanel {...props} />);

    // First tap: should queue l1 (index 0)
    const btn = screen.getByRole('button', { name: /Midi A\/B · Midi A/ });
    fireEvent.click(btn);
    expect(props.onAddToQueue).toHaveBeenCalledWith({ type: 'line', lineId: 'l1' });

    // After tap, the display should advance to "Midi B".
    // Re-render with same props (cursor lives in component state).
    rerender(<StagingPanel {...props} />);
    expect(screen.getByRole('button', { name: /Midi A\/B · Midi B/ })).toBeInTheDocument();
  });
});

describe('StagingPanel: merge alerts', () => {
  test('renders merge alert messages when provided', () => {
    render(<StagingPanel {...baseProps({
      mergeAlerts: [{ message: 'Queue merged with A/B' }],
    })} />);
    expect(screen.getByText(/Queue merged with A\/B/)).toBeInTheDocument();
  });

  test('dismisses alerts when close (×) is clicked', () => {
    render(<StagingPanel {...baseProps({
      mergeAlerts: [{ message: 'Queue merged with A/B' }],
    })} />);
    // The × in the alert is the only button inside the alert container.
    const alert = screen.getByText(/Queue merged with A\/B/).closest('div').parentElement;
    const closeBtn = within(alert).getByRole('button');
    fireEvent.click(closeBtn);
    expect(screen.queryByText(/Queue merged with A\/B/)).not.toBeInTheDocument();
  });
});
