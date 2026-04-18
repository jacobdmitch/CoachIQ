import React, { useMemo, useState } from 'react';
import useLongPress from '../../hooks/useLongPress';

/**
 * PlaytimePanel — live per-player minutes panel backed by the playtime_tick
 * socket event. Shows current minutes, target minutes, and a progress bar per
 * player, with an UNDER/OVER equity badge for any player HIGH-flagged by the
 * server-side equity engine.
 *
 * Collapsed by default so it doesn't crowd the Game Mode sideline view; tap
 * the header to expand.
 *
 * Long-press (tablet speed-path): when `onLongPressPlayer` is provided, each
 * row opens an action menu on long-press so the coach can log a stat or
 * trigger a sub without drilling through the Stats / Staging modals.
 */
export default function PlaytimePanel({
  athletes = [], playtime = [], equityFlags = [],
  onLongPressPlayer,
}) {
  const [open, setOpen] = useState(false);

  const flagsById = useMemo(() => {
    const map = new Map();
    for (const f of equityFlags) map.set(String(f.athleteId), f);
    return map;
  }, [equityFlags]);

  // Only show athletes we actually have roster info for; sort by on-field
  // status (on field first), then by lowest total minutes (most in need).
  const rows = useMemo(() => {
    if (!playtime.length) return [];
    const athletesById = new Map(athletes.map(a => [String(a.id), a]));
    return playtime
      .map(row => ({ ...row, athlete: athletesById.get(String(row.athleteId)) }))
      .filter(r => r.athlete)
      .sort((a, b) => {
        if (a.isOnField !== b.isOnField) return a.isOnField ? -1 : 1;
        return a.totalSeconds - b.totalSeconds;
      });
  }, [playtime, athletes]);

  const highFlags = equityFlags.filter(f => f.urgency === 'HIGH');

  return (
    <div className="card" style={{ marginBottom: 'var(--sp-6)', padding: 'var(--sp-4) var(--sp-5)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--color-text-primary)',
        }}
      >
        <span style={{
          fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
          letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)',
        }}>
          Playtime
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          {highFlags.length > 0 && (
            <span style={{
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px',
              letterSpacing: '1px', textTransform: 'uppercase',
              background: 'var(--color-amber-muted, rgba(180,100,0,0.15))',
              color: 'var(--color-gold)',
              padding: '3px 8px', borderRadius: 'var(--radius-full)',
            }}>
              {highFlags.length} alert{highFlags.length === 1 ? '' : 's'}
            </span>
          )}
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            {open ? '▾' : '▸'}
          </span>
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 'var(--sp-4)' }}>
          {rows.length === 0 ? (
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)', fontStyle: 'italic',
            }}>
              No playtime data yet — start the clock to begin tracking.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {rows.map(row => (
                <PlaytimeRow
                  key={row.athleteId}
                  row={row}
                  flag={flagsById.get(String(row.athleteId))}
                  onLongPress={onLongPressPlayer}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlaytimeRow({ row, flag, onLongPress }) {
  const { athlete, totalSeconds, targetSeconds, isOnField } = row;

  // Long-press opens the action menu at the press anchor. A short tap is a
  // no-op — the row isn't interactive on tap today, only on hold.
  const longPressHandlers = useLongPress(
    ({ anchor }) => onLongPress?.({ athlete, isOnField, anchor }),
    {}
  );
  const pct = Math.max(0, Math.min(100, (totalSeconds / Math.max(1, targetSeconds)) * 100));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const targetMins = Math.floor(targetSeconds / 60);

  const barColor = flag?.status === 'UNDER_TARGET'
    ? 'var(--color-gold)'
    : flag?.status === 'OVER_TARGET'
    ? 'var(--color-red)'
    : 'var(--color-green)';

  const name = `#${athlete.jersey_number ?? ''} ${athlete.last_name}`.trim();

  return (
    <div
      {...(onLongPress ? longPressHandlers : {})}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
        cursor: onLongPress ? 'pointer' : 'default',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
      }}
    >
      {/* Name + on-field dot */}
      <div style={{ flex: '0 0 120px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isOnField ? 'var(--color-green)' : 'var(--color-surface-3)',
        }} />
        <span style={{
          fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-xs)',
          color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {name}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ flex: 1, height: 6, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-full)' }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: barColor,
          borderRadius: 'var(--radius-full)', transition: 'width var(--ease-base)',
        }} />
      </div>

      {/* Minutes */}
      <span style={{
        flex: '0 0 70px', textAlign: 'right',
        fontFamily: 'var(--font-stats)', fontSize: 'var(--text-xs)',
        color: 'var(--color-text-primary)', letterSpacing: 1,
      }}>
        {mins}:{String(secs).padStart(2, '0')}
        <span style={{ color: 'var(--color-text-muted)' }}> / {targetMins}</span>
      </span>

      {flag?.urgency === 'HIGH' && (
        <span style={{
          flex: '0 0 auto',
          fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '9px',
          letterSpacing: '1px', textTransform: 'uppercase',
          color: flag.status === 'UNDER_TARGET' ? 'var(--color-gold)' : 'var(--color-red)',
        }}>
          {flag.status === 'UNDER_TARGET' ? `−${flag.minutesUnder}m` : `+${flag.minutesOver}m`}
        </span>
      )}
    </div>
  );
}
