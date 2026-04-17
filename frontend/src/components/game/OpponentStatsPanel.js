import React, { useEffect, useState } from 'react';
import apiClient from '../../config/api';

// Event types the opponent quick-logger can record. Mirrors the backend
// OPPONENT_EVENT_TYPES list. Label is the short string shown on the button.
const OPPONENT_EVENTS = [
  { type: 'goal',           label: 'Goal',     variant: 'red'    },
  { type: 'shot',           label: 'Shot',     variant: 'default' },
  { type: 'shot_on_goal',   label: 'SOG',      variant: 'default' },
  { type: 'ground_ball',    label: 'GB',       variant: 'default' },
  { type: 'caused_turnover',label: 'CT',       variant: 'default' },
  { type: 'turnover',       label: 'TO',       variant: 'default' },
  { type: 'save',           label: 'Save',     variant: 'default' },
  { type: 'faceoff_win',    label: 'FO Win',   variant: 'green'  },
  { type: 'faceoff_loss',   label: 'FO Loss',  variant: 'default' },
  { type: 'penalty',        label: 'Penalty',  variant: 'amber'  },
];

/**
 * OpponentStatsPanel — tap-to-log opponent stat strip.
 *
 * Fires POST /api/game-live/:gameId/opponent-event for each tap. If a game has
 * a linked opposing_team, pulling its roster lets the coach optionally pick a
 * player to attribute the event to (feeds the P6 threat calculator). When no
 * opposing player is picked, the event is logged as an anonymous team stat.
 *
 * Collapsed by default; coaches open it when they want to track opposing
 * stats during live play.
 */
export default function OpponentStatsPanel({ gameId, opposingTeamId, logOpponentEvent, opponentName = 'Opponent' }) {
  const [open, setOpen]           = useState(false);
  const [players, setPlayers]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [pickedId, setPickedId]   = useState(null);
  const [busy, setBusy]           = useState(null);  // eventType currently logging
  const [error, setError]         = useState(null);

  useEffect(() => {
    if (!opposingTeamId || !open) return;
    let cancelled = false;
    setLoading(true);
    apiClient.get('/opposing/players', { params: { opposingTeamId } })
      .then(res => {
        if (cancelled) return;
        setPlayers(res.data.opposingPlayers || []);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.response?.data?.error || 'Failed to load opposing roster');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [opposingTeamId, open]);

  async function handleLog(eventType) {
    if (busy) return;
    setBusy(eventType);
    setError(null);
    try {
      await logOpponentEvent(eventType, pickedId || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Log failed');
    } finally {
      setBusy(null);
    }
  }

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
          {opponentName} Stats
        </span>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 'var(--sp-4)' }}>
          {/* Player picker (only when a scouting roster is linked) */}
          {opposingTeamId && (
            <div style={{ marginBottom: 'var(--sp-3)' }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px',
                letterSpacing: '1.5px', textTransform: 'uppercase',
                color: 'var(--color-text-muted)', marginBottom: 'var(--sp-2)',
              }}>
                Attribute to
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
                <PickerButton
                  active={pickedId === null}
                  onClick={() => setPickedId(null)}
                >
                  Team (anon.)
                </PickerButton>
                {loading && (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Loading…
                  </span>
                )}
                {!loading && players.map(p => (
                  <PickerButton
                    key={p.id}
                    active={pickedId === p.id}
                    onClick={() => setPickedId(p.id)}
                  >
                    {p.jersey_number != null ? `#${p.jersey_number} ` : ''}{p.display_name || 'Unnamed'}
                  </PickerButton>
                ))}
              </div>
            </div>
          )}

          {/* Quick-log event buttons */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))',
            gap: 'var(--sp-2)',
          }}>
            {OPPONENT_EVENTS.map(ev => (
              <EventButton
                key={ev.type}
                variant={ev.variant}
                disabled={!!busy}
                logging={busy === ev.type}
                onClick={() => handleLog(ev.type)}
              >
                {ev.label}
              </EventButton>
            ))}
          </div>

          {error && (
            <p style={{
              marginTop: 'var(--sp-2)',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              color: 'var(--color-red)',
            }}>
              {error}
            </p>
          )}

          {!opposingTeamId && (
            <p style={{
              marginTop: 'var(--sp-2)',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)', fontStyle: 'italic',
            }}>
              Link an opposing scouting roster to this game to attribute stats
              to specific opponents.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PickerButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: 'var(--sp-1) var(--sp-3)', minHeight: 32,
        borderRadius: 'var(--radius-full)',
        background: active ? 'var(--color-gold-muted)' : 'transparent',
        border: `1px solid ${active ? 'var(--color-gold)' : 'var(--color-surface-3)'}`,
        color: active ? 'var(--color-gold)' : 'var(--color-text-muted)',
        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '11px',
        letterSpacing: '0.5px', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function EventButton({ variant, disabled, logging, onClick, children }) {
  const palettes = {
    red:    { bg: 'var(--color-red-bg)',   border: 'var(--color-red-border)',   color: 'var(--color-red)' },
    green:  { bg: 'var(--color-green-bg)', border: 'var(--color-green-border)', color: 'var(--color-green)' },
    amber:  { bg: 'var(--color-amber-muted, rgba(180,100,0,0.15))', border: 'var(--color-amber-border, rgba(180,100,0,0.3))', color: 'var(--color-gold)' },
    default:{ bg: 'var(--color-surface-2)', border: 'var(--color-surface-3)',   color: 'var(--color-text-primary)' },
  };
  const p = palettes[variant] || palettes.default;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: 'var(--sp-3)', minHeight: 48,
        borderRadius: 'var(--radius-md)',
        background: p.bg, border: `1px solid ${p.border}`, color: p.color,
        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
        letterSpacing: '0.5px', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !logging ? 0.4 : logging ? 0.6 : 1,
        transition: 'all var(--ease-base)',
      }}
    >
      {logging ? '…' : children}
    </button>
  );
}
