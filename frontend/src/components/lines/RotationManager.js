import React, { useMemo, useState } from 'react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { useRotations } from '../../hooks/useRotations';

const POS_VARIANT  = { attack: 'red', midfield: 'gold', defense: 'blue' };
const POS_OPTIONS  = [
  { key: 'attack',   label: 'Attack'   },
  { key: 'midfield', label: 'Midfield' },
  { key: 'defense',  label: 'Defense'  },
];

/**
 * RotationManager — create / edit / delete line-rotation templates.
 *
 * A rotation is an ordered sequence of saved lines within one position group.
 * During a game, the coach cycles through the sequence (Line A → B → C → A).
 * The current position in the rotation is NOT stored here — it's per-game
 * client state owned by the staging panel.
 */
export default function RotationManager({ teamId, lines }) {
  const { rotations, createRotation, deleteRotation } = useRotations(teamId);

  const [showForm, setShowForm] = useState(false);

  // Group rotations for display.
  const grouped = useMemo(() => {
    const out = { attack: [], midfield: [], defense: [] };
    for (const r of rotations) {
      if (out[r.position_group]) out[r.position_group].push(r);
    }
    return out;
  }, [rotations]);

  const lineById = useMemo(() => {
    const m = new Map();
    for (const l of lines) m.set(l.id, l);
    return m;
  }, [lines]);

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 'var(--sp-3)',
      }}>
        <p className="section-heading" style={{ margin: 0 }}>Rotations</p>
        <Button variant="outline" size="sm" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Close' : '+ New Rotation'}
        </Button>
      </div>

      {showForm && (
        <RotationForm
          lines={lines}
          onSubmit={async body => { await createRotation(body); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {rotations.length === 0 && !showForm && (
        <p style={{
          padding: 'var(--sp-4)', color: 'var(--color-text-subtle)',
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)',
          textAlign: 'center', background: 'var(--color-surface-1)',
          borderRadius: 'var(--radius-md)', marginBottom: 'var(--sp-5)',
        }}>
          No rotation templates yet. Build one so gameday subs are one tap.
        </p>
      )}

      {POS_OPTIONS.map(g => grouped[g.key].length > 0 && (
        <div key={g.key} style={{ marginBottom: 'var(--sp-4)' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
            letterSpacing: '1.5px', textTransform: 'uppercase',
            color: 'var(--color-text-muted)', marginBottom: 'var(--sp-2)',
          }}>
            {g.label}
          </p>
          {grouped[g.key].map(r => (
            <div key={r.id} className="card" style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
              padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-2)',
            }}>
              <span style={{
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)',
                color: 'var(--color-text-primary)',
              }}>
                {r.name}
              </span>
              <Badge variant={POS_VARIANT[r.position_group] || 'gray'}>
                {r.position_group}
              </Badge>
              <span style={{
                flex: 1, fontFamily: 'var(--font-body)', fontWeight: 300,
                fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
              }}>
                {r.line_ids.map(id => lineById.get(id)?.name || '?').join(' → ')}
              </span>
              <button
                onClick={() => {
                  if (window.confirm(`Delete rotation "${r.name}"?`)) deleteRotation(r.id);
                }}
                aria-label={`Delete ${r.name}`}
                title="Delete"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-subtle)',
                  fontSize: 'var(--text-base)', minHeight: 36, minWidth: 36,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function RotationForm({ lines, onSubmit, onCancel }) {
  const [name, setName]                   = useState('');
  const [positionGroup, setPositionGroup] = useState('midfield');
  const [lineIds, setLineIds]             = useState([]);
  const [busy, setBusy]                   = useState(false);
  const [err,  setErr]                    = useState(null);

  const eligibleLines = useMemo(
    () => lines.filter(l => l.position_group === positionGroup),
    [lines, positionGroup]
  );

  function toggleLine(id) {
    setLineIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function moveLine(index, delta) {
    setLineIds(prev => {
      const next = [...prev];
      const to   = index + delta;
      if (to < 0 || to >= next.length) return prev;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || lineIds.length < 2) {
      setErr('Name and at least two lines are required.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({ name: name.trim(), positionGroup, lineIds });
    } catch (e2) {
      setErr(e2.response?.data?.error || e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{
      padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)',
    }}>
      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Rotation name (e.g., Midi A/B/C)"
          style={{
            flex: '1 1 240px', minWidth: 180,
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', padding: '10px 12px',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--color-text-primary)', outline: 'none',
          }}
        />
        <select
          value={positionGroup}
          onChange={e => { setPositionGroup(e.target.value); setLineIds([]); }}
          style={{
            minWidth: 140, background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', padding: '10px 12px',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--color-text-primary)',
          }}
        >
          {POS_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      {/* Selected ordered rotation */}
      <p style={{
        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
        letterSpacing: '1.5px', textTransform: 'uppercase',
        color: 'var(--color-text-muted)', marginBottom: 'var(--sp-2)',
      }}>
        Sequence ({lineIds.length} selected)
      </p>
      {lineIds.length === 0 ? (
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)',
          color: 'var(--color-text-subtle)', marginBottom: 'var(--sp-3)',
        }}>
          Tap lines below to add them in order.
        </p>
      ) : (
        <div style={{ marginBottom: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {lineIds.map((id, i) => {
            const line = lines.find(l => l.id === id);
            return (
              <div key={`${id}-${i}`} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
                padding: 'var(--sp-2) var(--sp-3)',
                background: 'var(--color-surface-1)',
                border: '1px solid var(--color-surface-2)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <span style={{ fontFamily: 'var(--font-stats)', fontSize: 12, color: 'var(--color-text-muted)', minWidth: 20 }}>
                  {i + 1}.
                </span>
                <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                  {line?.name || 'Unknown line'}
                </span>
                <button type="button" onClick={() => moveLine(i, -1)} disabled={i === 0}
                  style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'var(--color-text-subtle)' : 'var(--color-text-muted)', minHeight: 36, minWidth: 28, fontSize: 14 }}
                >↑</button>
                <button type="button" onClick={() => moveLine(i, 1)} disabled={i === lineIds.length - 1}
                  style={{ background: 'none', border: 'none', cursor: i === lineIds.length - 1 ? 'default' : 'pointer', color: i === lineIds.length - 1 ? 'var(--color-text-subtle)' : 'var(--color-text-muted)', minHeight: 36, minWidth: 28, fontSize: 14 }}
                >↓</button>
                <button type="button" onClick={() => setLineIds(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', minHeight: 36, minWidth: 28, fontSize: 14 }}
                >×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Available lines for this group */}
      <p style={{
        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
        letterSpacing: '1.5px', textTransform: 'uppercase',
        color: 'var(--color-text-muted)', marginBottom: 'var(--sp-2)',
      }}>
        Available {positionGroup} lines
      </p>
      {eligibleLines.length === 0 ? (
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)',
          color: 'var(--color-text-subtle)', marginBottom: 'var(--sp-3)',
        }}>
          No saved {positionGroup} lines yet. Save lines above first.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--sp-3)' }}>
          {eligibleLines.map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => toggleLine(l.id)}
              style={{
                padding: 'var(--sp-2) var(--sp-3)',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-surface-3)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-xs)',
                cursor: 'pointer', minHeight: 36,
              }}
            >
              + {l.name}
            </button>
          ))}
        </div>
      )}

      {err && (
        <p style={{ color: 'var(--color-red)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', marginBottom: 'var(--sp-2)' }}>
          {err}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <Button variant="outline" size="sm" type="button" onClick={onCancel} style={{ flex: 1 }}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" type="submit" disabled={busy} style={{ flex: 1 }}>
          {busy ? 'Saving…' : 'Save Rotation'}
        </Button>
      </div>
    </form>
  );
}
