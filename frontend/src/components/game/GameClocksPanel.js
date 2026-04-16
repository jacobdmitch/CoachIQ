import React, { useMemo } from 'react';
import CountdownClock from './CountdownClock';

/**
 * GameClocksPanel — secondary countdown clocks for live game use.
 *
 * Renders the clocks that apply to the current game format:
 *   - Standard: Clear (20s), Stall (10s), Timeout (60s)
 *   - 6s:       Shot Clock (default 45s/60s/75s), Timeout (60s)
 *
 * These are separate from the game clock (which the server controls) and
 * run entirely on the coach's device. A coach typically starts Clear on a
 * goalie save or ball-down in the defensive end, Stall on a stall warning,
 * and Shot Clock each possession in sixes.
 */
export default function GameClocksPanel({ format = 'standard', shotClockSeconds }) {
  const clocks = useMemo(() => {
    if (format === '6s') {
      return [
        { key: 'shot',    label: 'Shot Clock', initialSeconds: shotClockSeconds || 60, warnAt: 10 },
        { key: 'timeout', label: 'Timeout',    initialSeconds: 60,                     warnAt: 10 },
      ];
    }
    return [
      { key: 'clear',   label: 'Clear',   initialSeconds: 20, warnAt: 5 },
      { key: 'stall',   label: 'Stall',   initialSeconds: 10, warnAt: 3 },
      { key: 'timeout', label: 'Timeout', initialSeconds: 60, warnAt: 10 },
    ];
  }, [format, shotClockSeconds]);

  return (
    <div className="card" style={{ marginBottom: 'var(--sp-6)', padding: 'var(--sp-4) var(--sp-5)' }}>
      <p className="section-heading" style={{ marginTop: 0, marginBottom: 'var(--sp-3)' }}>
        Clocks
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 'var(--sp-3)',
      }}>
        {clocks.map(c => (
          <CountdownClock
            key={c.key}
            label={c.label}
            initialSeconds={c.initialSeconds}
            warnAt={c.warnAt}
            compact
          />
        ))}
      </div>
    </div>
  );
}
