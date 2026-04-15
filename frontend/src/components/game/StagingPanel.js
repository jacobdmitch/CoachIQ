import React, { useState } from 'react';
import Button from '../common/Button';

// ─── Constants ────────────────────────────────────────────────────────────────

const SITUATION_OPTIONS = [
  { key: 'man_up',       label: 'Man Up (EMO)' },
  { key: 'man_down',     label: 'Man Down' },
  { key: 'faceoff',      label: 'Faceoff' },
  { key: 'clear',        label: 'Clear' },
  { key: 'settled',      label: 'Settled Offense' },
  { key: 'transition',   label: 'Transition' },
];

const SITUATION_OPTIONS_6S = [
  { key: 'man_up',          label: 'Man Up' },
  { key: 'man_down',        label: 'Man Down' },
  { key: '6s_fast_break',   label: 'Fast Break' },
  { key: 'faceoff',         label: 'Faceoff' },
];

const SOURCE_LABEL = {
  manual:             '',
  line:               '',
  situation_assigned: '✓ assigned',
  ai_suggested:       'AI',
};

// ─── Individual sub picker ────────────────────────────────────────────────────

function IndividualSubPicker({ liveState, athletes, onAdd, onClose }) {
  const [playerIn,  setPlayerIn]  = useState(null);
  const [playerOut, setPlayerOut] = useState(null);

  const benchIds = liveState?.bench || [];
  const bench    = athletes.filter(a => benchIds.includes(a.id));
  const field    = athletes.filter(a =>
    Object.values(liveState?.fieldPositions || {}).includes(a.id)
  );

  function getPosition(athleteId) {
    if (!liveState?.fieldPositions) return null;
    return Object.entries(liveState.fieldPositions).find(([, id]) => id === athleteId)?.[0] || null;
  }

  function handleConfirm() {
    if (!playerIn || !playerOut) return;
    const position = getPosition(playerOut);
    onAdd({ type: 'individual', playerIn, playerOut, position });
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'var(--sp-4)',
    }}>
      <div style={{
        background: 'var(--color-surface-0)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-surface-2)',
        width: '100%', maxWidth: 500,
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--color-surface-2)' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
            Stage Individual Sub
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden' }}>
          {/* Sub IN — bench */}
          <div style={{ borderRight: '1px solid var(--color-surface-2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <p style={{ padding: 'var(--sp-3) var(--sp-4)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-green)', borderBottom: '1px solid var(--color-surface-1)' }}>
              IN — Bench
            </p>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {bench.map(a => (
                <button
                  key={a.id}
                  onClick={() => setPlayerIn(a.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
                    width: '100%', padding: 'var(--sp-3) var(--sp-4)',
                    background: playerIn === a.id ? 'rgba(34,197,94,0.1)' : 'none',
                    border: 'none', borderBottom: '1px solid var(--color-surface-1)',
                    borderLeft: playerIn === a.id ? '3px solid var(--color-green)' : '3px solid transparent',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'all var(--ease-fast)',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-stats)', fontSize: 11, color: 'var(--color-text-muted)', minWidth: 20, textAlign: 'right' }}>
                    #{a.jersey_number ?? '—'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
                    {a.first_name} {a.last_name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Sub OUT — field */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <p style={{ padding: 'var(--sp-3) var(--sp-4)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-red)', borderBottom: '1px solid var(--color-surface-1)' }}>
              OUT — Field
            </p>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {field.map(a => (
                <button
                  key={a.id}
                  onClick={() => setPlayerOut(a.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
                    width: '100%', padding: 'var(--sp-3) var(--sp-4)',
                    background: playerOut === a.id ? 'rgba(239,68,68,0.1)' : 'none',
                    border: 'none', borderBottom: '1px solid var(--color-surface-1)',
                    borderLeft: playerOut === a.id ? '3px solid var(--color-red)' : '3px solid transparent',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'all var(--ease-fast)',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-stats)', fontSize: 11, color: 'var(--color-text-muted)', minWidth: 20, textAlign: 'right' }}>
                    #{a.jersey_number ?? '—'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
                    {a.first_name} {a.last_name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: 'var(--sp-3) var(--sp-5)', borderTop: '1px solid var(--color-surface-2)', display: 'flex', gap: 'var(--sp-2)' }}>
          <Button variant="outline" size="sm" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleConfirm} disabled={!playerIn || !playerOut} style={{ flex: 1 }}>
            Stage Sub
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Queue entry display ──────────────────────────────────────────────────────

function QueueEntry({ entry, athletes, onRemoveEntry, onRemoveMove }) {
  const [expanded, setExpanded] = useState(true);

  function athleteName(id) {
    const a = athletes.find(x => x.id === id);
    return a ? `${a.first_name} ${a.last_name}` : '—';
  }

  const sourceTag = SOURCE_LABEL[entry.source];

  return (
    <div style={{
      border: '1px solid var(--color-surface-2)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      marginBottom: 'var(--sp-2)',
    }}>
      {/* Entry header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
        padding: 'var(--sp-3) var(--sp-3)',
        background: 'var(--color-surface-1)',
        cursor: 'pointer',
      }} onClick={() => setExpanded(e => !e)}>
        <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
          {entry.type === 'situation' ? '▶ ' : entry.type === 'line' ? '⇄ ' : '● '}
          {entry.label}
          {sourceTag && (
            <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: 'var(--color-gold-muted)', border: '1px solid var(--color-gold-border)', color: 'var(--color-gold)', fontSize: 10, fontWeight: 700 }}>
              {sourceTag}
            </span>
          )}
        </span>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 10, color: 'var(--color-text-muted)' }}>
          {entry.moves.length} sub{entry.moves.length !== 1 ? 's' : ''} {expanded ? '▲' : '▼'}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onRemoveEntry(entry.queueId); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-subtle)', fontSize: 16, lineHeight: 1,
            padding: '0 2px', minWidth: 24, minHeight: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Remove"
        >
          ×
        </button>
      </div>

      {/* Staying players */}
      {expanded && entry.stayingPlayers?.length > 0 && (
        <div style={{ padding: 'var(--sp-2) var(--sp-3)', background: 'var(--color-surface-0)', borderBottom: '1px solid var(--color-surface-1)' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Staying: {entry.stayingPlayers.map(athleteName).join(', ')}
          </p>
        </div>
      )}

      {/* Move rows */}
      {expanded && entry.moves.map(move => (
        <div key={move.moveId} style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
          padding: 'var(--sp-2) var(--sp-3)',
          borderBottom: '1px solid var(--color-surface-1)',
          background: 'var(--color-surface-0)',
        }}>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-green)', minWidth: 0, flex: 1 }}>
            ↑ {athleteName(move.playerIn)}
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-red)', minWidth: 0, flex: 1 }}>
            ↓ {athleteName(move.playerOut)}
          </span>
          <span style={{ fontFamily: 'var(--font-stats)', fontSize: 10, color: 'var(--color-text-subtle)', flexShrink: 0 }}>
            {move.position}
          </span>
          <button
            onClick={() => onRemoveMove(entry.queueId, move.moveId)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-subtle)', fontSize: 14, lineHeight: 1,
              padding: '0 2px', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Remove move"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── StagingPanel ─────────────────────────────────────────────────────────────

/**
 * Sub staging panel — sits alongside the live game scoreboard.
 * Coaches build a queue of subs (individual, line, or situation),
 * then fire them all at once with "Activate All".
 */
export default function StagingPanel({
  gameId,
  gameFormat,
  liveState,
  athletes,
  lines,
  mergeAlerts,
  onAddToQueue,
  onRemoveEntry,
  onRemoveMove,
  onActivate,
  activating,
}) {
  const [mode,        setMode]        = useState(null); // 'individual' | 'line' | 'situation'
  const [alertsDismissed, setAlertsDismissed] = useState(false);

  const subQueue = liveState?.subQueue || [];
  const totalMoves = subQueue.reduce((n, e) => n + e.moves.length, 0);

  const situationOptions = gameFormat === '6s' ? SITUATION_OPTIONS_6S : SITUATION_OPTIONS;

  function handleAddIndividual(params) {
    onAddToQueue({ type: 'individual', ...params });
  }

  const showAlerts = mergeAlerts?.length > 0 && !alertsDismissed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>

      {/* Merge alerts */}
      {showAlerts && (
        <div style={{
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--color-gold-muted)',
          border: '1px solid var(--color-gold-border)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-2)' }}>
            <div>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--color-gold)', marginBottom: 4 }}>
                Queue updated
              </p>
              {mergeAlerts.map((a, i) => (
                <p key={i} style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
                  {a.message}
                </p>
              ))}
            </div>
            <button
              onClick={() => setAlertsDismissed(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-gold)', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Queue header + activate */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
        <p className="section-heading" style={{ margin: 0, flex: 1 }}>
          Staged Subs {totalMoves > 0 && `· ${totalMoves} move${totalMoves !== 1 ? 's' : ''}`}
        </p>
        {totalMoves > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => { onActivate(); setAlertsDismissed(false); }}
            disabled={activating}
            style={{ minWidth: 100 }}
          >
            {activating ? 'Activating…' : '▶ Activate All'}
          </Button>
        )}
      </div>

      {/* Queue entries */}
      {subQueue.length === 0 && (
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', padding: 'var(--sp-4)', textAlign: 'center', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-md)' }}>
          No subs staged
        </p>
      )}
      {subQueue.map(entry => (
        <QueueEntry
          key={entry.queueId}
          entry={entry}
          athletes={athletes}
          onRemoveEntry={onRemoveEntry}
          onRemoveMove={onRemoveMove}
        />
      ))}

      {/* Add to queue buttons */}
      <p className="section-heading" style={{ margin: '4px 0 0' }}>Add to Queue</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-2)' }}>
        <Button variant="outline" size="sm" onClick={() => setMode('individual')} style={{ justifyContent: 'center' }}>
          + Sub
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMode('line')} style={{ justifyContent: 'center' }}>
          ⇄ Line
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMode('situation')} style={{ justifyContent: 'center' }}>
          ▶ Situation
        </Button>
      </div>

      {/* Line picker */}
      {mode === 'line' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 'var(--sp-4)',
        }}>
          <div style={{
            background: 'var(--color-surface-0)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-surface-2)',
            width: '100%', maxWidth: 380,
            overflow: 'hidden',
          }}>
            <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--color-surface-2)' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                Swap Line
              </p>
            </div>
            {lines.length === 0 && (
              <p style={{ padding: 'var(--sp-6)', fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)', color: 'var(--color-text-subtle)', textAlign: 'center' }}>
                No lines saved. Add lines in Roster settings.
              </p>
            )}
            {['attack', 'midfield', 'defense'].map(group => {
              const groupLines = lines.filter(l => l.position_group === group);
              if (groupLines.length === 0) return null;
              return (
                <div key={group}>
                  <p style={{ padding: 'var(--sp-2) var(--sp-5)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', background: 'var(--color-surface-1)' }}>
                    {group}
                  </p>
                  {groupLines.map(line => (
                    <button
                      key={line.id}
                      onClick={() => { onAddToQueue({ type: 'line', lineId: line.id }); setMode(null); }}
                      style={{
                        display: 'block', width: '100%', padding: 'var(--sp-3) var(--sp-5)',
                        background: 'none', border: 'none', borderBottom: '1px solid var(--color-surface-1)',
                        cursor: 'pointer', textAlign: 'left',
                        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
                        transition: 'background var(--ease-fast)',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {line.name}
                    </button>
                  ))}
                </div>
              );
            })}
            <div style={{ padding: 'var(--sp-3) var(--sp-5)', borderTop: '1px solid var(--color-surface-2)' }}>
              <Button variant="outline" size="sm" onClick={() => setMode(null)} style={{ width: '100%' }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Situation picker */}
      {mode === 'situation' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 'var(--sp-4)',
        }}>
          <div style={{
            background: 'var(--color-surface-0)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-surface-2)',
            width: '100%', maxWidth: 360,
            overflow: 'hidden',
          }}>
            <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--color-surface-2)' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                Load Situation
              </p>
            </div>
            {situationOptions.map(s => (
              <button
                key={s.key}
                onClick={() => { onAddToQueue({ type: 'situation', situationType: s.key }); setMode(null); }}
                style={{
                  display: 'block', width: '100%', padding: 'var(--sp-4) var(--sp-5)',
                  background: 'none', border: 'none', borderBottom: '1px solid var(--color-surface-1)',
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
                  transition: 'background var(--ease-fast)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {s.label}
              </button>
            ))}
            <div style={{ padding: 'var(--sp-3) var(--sp-5)', borderTop: '1px solid var(--color-surface-2)' }}>
              <Button variant="outline" size="sm" onClick={() => setMode(null)} style={{ width: '100%' }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Individual sub picker */}
      {mode === 'individual' && (
        <IndividualSubPicker
          liveState={liveState}
          athletes={athletes}
          onAdd={handleAddIndividual}
          onClose={() => setMode(null)}
        />
      )}
    </div>
  );
}
