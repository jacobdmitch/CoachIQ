import React, { useEffect, useState } from 'react';
import apiClient from '../../config/api';

/**
 * OpponentThreatsPanel — ranked opposing players by threat score (P6).
 *
 * The ranking blends season-to-date scouting stats with live in-game
 * events. Each row surfaces the top 2 contributors so a coach knows *why*
 * a player is flagged — "3 Goals today, +5 Goals season" — not just that
 * they are.
 *
 * Collapsed by default; expands on tap. Fetches once on mount, then
 * updates in place from the `opponent_threats` socket broadcast emitted
 * by the server after each opponent-event log.
 */
export default function OpponentThreatsPanel({ gameId, opposingTeamId, threats }) {
  const [open, setOpen]       = useState(false);
  const [initial, setInitial] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  // Prime with a REST fetch so the panel has data before any event fires.
  useEffect(() => {
    if (!gameId || !opposingTeamId || !open) return;
    let cancelled = false;
    setLoading(true);
    apiClient.get(`/game-live/${gameId}/threats`)
      .then(res => { if (!cancelled) setInitial(res.data.threats || []); })
      .catch(err => {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load threats');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gameId, opposingTeamId, open]);

  // Live socket threats take precedence once the server has broadcast them.
  const list = (threats && threats.length) ? threats : initial;
  const visible = list.filter(t => t.score > 0).slice(0, 10);
  const topBadges = list.filter(t => t.badge === 'LOCKDOWN' || t.badge === 'HIGH').length;

  if (!opposingTeamId) return null;

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
          Opposing Threats
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          {topBadges > 0 && (
            <span style={{
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px',
              letterSpacing: '1px', textTransform: 'uppercase',
              background: 'var(--color-red-bg)', color: 'var(--color-red)',
              padding: '3px 8px', borderRadius: 'var(--radius-full)',
            }}>
              {topBadges} flagged
            </span>
          )}
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            {open ? '▾' : '▸'}
          </span>
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 'var(--sp-4)' }}>
          {loading && (
            <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
              Loading threats…
            </p>
          )}
          {error && (
            <p style={{ color: 'var(--color-red)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
              {error}
            </p>
          )}
          {!loading && visible.length === 0 && (
            <p style={{
              color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-xs)', fontStyle: 'italic',
            }}>
              No opposing production yet. Log opponent events to populate threats.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {visible.map((t, i) => (
              <ThreatRow key={t.playerId} threat={t} rank={i + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const BADGE_STYLES = {
  LOCKDOWN: { bg: 'var(--color-red-bg)', color: 'var(--color-red)', label: 'Lockdown' },
  HIGH:     { bg: 'rgba(239,68,68,0.08)', color: '#f97316',         label: 'High' },
  WATCH:    { bg: 'var(--color-gold-muted)', color: 'var(--color-gold)', label: 'Watch' },
  LOW:      { bg: 'var(--color-surface-2)', color: 'var(--color-text-muted)', label: 'Low' },
};

function ThreatRow({ threat, rank }) {
  const badge = BADGE_STYLES[threat.badge] || BADGE_STYLES.LOW;
  const name = threat.display_name || 'Unnamed';
  const jersey = threat.jersey_number != null ? `#${threat.jersey_number}` : '—';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
      padding: 'var(--sp-2) var(--sp-3)',
      background: 'var(--color-surface-1)',
      border: `1px solid ${threat.badge === 'LOCKDOWN' ? 'var(--color-red-border)' : 'var(--color-surface-3)'}`,
      borderRadius: 'var(--radius-sm)',
    }}>
      <span style={{
        width: 20, textAlign: 'center',
        fontFamily: 'var(--font-stats)', fontSize: 'var(--text-xs)',
        color: 'var(--color-text-muted)',
      }}>
        {rank}
      </span>
      <span style={{
        width: 44, textAlign: 'center',
        fontFamily: 'var(--font-stats)', fontSize: 'var(--text-sm)',
        color: 'var(--color-gold)',
      }}>
        {jersey}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span style={{
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)',
            color: 'var(--color-text-primary)', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
          }}>
            {name}
          </span>
          {threat.primary_position && (
            <span style={{
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px',
              letterSpacing: 1, textTransform: 'uppercase',
              color: 'var(--color-text-subtle)',
            }}>
              {threat.primary_position}
            </span>
          )}
        </div>
        <p style={{
          margin: '2px 0 0',
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '11px',
          color: 'var(--color-text-muted)',
        }}>
          {threat.why}
        </p>
      </div>
      <span style={{
        padding: '2px 8px', borderRadius: 'var(--radius-full)',
        background: badge.bg, color: badge.color,
        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px',
        letterSpacing: '1px', textTransform: 'uppercase',
      }}>
        {badge.label}
      </span>
      <span style={{
        fontFamily: 'var(--font-stats)', fontSize: 'var(--text-base)',
        color: 'var(--color-text-primary)', minWidth: 40, textAlign: 'right',
      }}>
        {threat.score.toFixed(1)}
      </span>
    </div>
  );
}
