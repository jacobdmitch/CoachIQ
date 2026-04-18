import React, { useState, useEffect } from 'react';
import Button from '../common/Button';
import { useGameSetup } from '../../hooks/useGameSetup';
import ScoutingTab from './ScoutingTab';

// ─── Constants ────────────────────────────────────────────────────────────────

const SITUATION_TYPES = [
  { key: 'man_up',         label: 'Man Up (EMO)',     desc: 'Extra man offense' },
  { key: 'man_down',       label: 'Man Down',         desc: 'Extra man defense' },
  { key: 'faceoff',        label: 'Faceoff',          desc: 'Faceoff unit' },
  { key: 'clear',          label: 'Clear',            desc: 'Defensive clear unit' },
  { key: 'settled',        label: 'Settled Offense',  desc: 'Half-field set offense' },
  { key: 'transition',     label: 'Transition',       desc: 'Fast-break / ride unit' },
];

const SITUATION_TYPES_6S = [
  { key: 'man_up',          label: 'Man Up',       desc: 'Extra man offense' },
  { key: 'man_down',        label: 'Man Down',     desc: 'Extra man defense' },
  { key: '6s_fast_break',   label: 'Fast Break',   desc: 'Fast break unit' },
  { key: 'faceoff',         label: 'Faceoff',      desc: 'Faceoff unit' },
];

// Field position layout per format
const POSITION_LAYOUT = {
  standard: [
    { slot: 'goalie',  label: 'GK',  group: 'Goalie'   },
    { slot: 'field_6', label: 'D',   group: 'Defense'  },
    { slot: 'field_7', label: 'D',   group: 'Defense'  },
    { slot: 'field_8', label: 'D',   group: 'Defense'  },
    { slot: 'field_3', label: 'M',   group: 'Midfield' },
    { slot: 'field_4', label: 'M',   group: 'Midfield' },
    { slot: 'field_5', label: 'M',   group: 'Midfield' },
    { slot: 'field_0', label: 'A',   group: 'Attack'   },
    { slot: 'field_1', label: 'A',   group: 'Attack'   },
    { slot: 'field_2', label: 'A',   group: 'Attack'   },
  ],
  '6s': [
    { slot: 'goalie',  label: 'GK',  group: 'Goalie'   },
    { slot: 'field_4', label: 'D',   group: 'Defense'  },
    { slot: 'field_2', label: 'M',   group: 'Midfield' },
    { slot: 'field_3', label: 'M',   group: 'Midfield' },
    { slot: 'field_0', label: 'A',   group: 'Attack'   },
    { slot: 'field_1', label: 'A',   group: 'Attack'   },
  ],
};

const GROUP_COLORS = {
  Goalie:   { bg: 'var(--color-surface-2)', border: 'var(--color-surface-3)', text: 'var(--color-text-muted)' },
  Defense:  { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)',  text: '#3b82f6' },
  Midfield: { bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.3)',  text: '#a855f7' },
  Attack:   { bg: 'var(--color-gold-muted)', border: 'var(--color-gold-border)', text: 'var(--color-gold)' },
};

// ─── Player picker modal ───────────────────────────────────────────────────────

function PlayerPicker({ athletes, excludeIds, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = athletes.filter(a => {
    const name = `${a.first_name} ${a.last_name}`.toLowerCase();
    return name.includes(search.toLowerCase()) && !excludeIds.includes(a.id);
  });

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
        width: '100%', maxWidth: 420,
        maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--color-surface-2)' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', marginBottom: 'var(--sp-3)' }}>
            Select Player
          </p>
          <input
            autoFocus
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 && (
            <p style={{ padding: 'var(--sp-6)', color: 'var(--color-text-subtle)', fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)', textAlign: 'center' }}>
              No available players
            </p>
          )}
          {filtered.map(a => (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                width: '100%', padding: 'var(--sp-3) var(--sp-5)',
                background: 'none', border: 'none', borderBottom: '1px solid var(--color-surface-1)',
                cursor: 'pointer', textAlign: 'left',
                transition: 'background var(--ease-fast)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{
                fontFamily: 'var(--font-stats)', fontSize: 'var(--text-xs)',
                color: 'var(--color-text-muted)', minWidth: 24, textAlign: 'right',
              }}>
                #{a.jersey_number ?? '—'}
              </span>
              <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                {a.first_name} {a.last_name}
              </span>
              <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                {a.primary_position || '—'}
              </span>
            </button>
          ))}
        </div>
        <div style={{ padding: 'var(--sp-3) var(--sp-5)', borderTop: '1px solid var(--color-surface-2)' }}>
          <Button variant="outline" size="sm" onClick={onClose} style={{ width: '100%' }}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Situation Assignment Row ─────────────────────────────────────────────────

function SituationRow({ situationType, label, desc, athletes, playerIds, onSave, onClear }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(playerIds || []);

  const assignedAthletes = selected.map(id => athletes.find(a => a.id === id)).filter(Boolean);

  function togglePlayer(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function handleSave() {
    onSave(situationType, selected);
    setOpen(false);
  }

  function handleClear() {
    setSelected([]);
    onClear(situationType);
    setOpen(false);
  }

  // Keep local state in sync if parent updates
  React.useEffect(() => { setSelected(playerIds || []); }, [playerIds]);

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
        padding: 'var(--sp-4) var(--sp-5)',
        borderBottom: '1px solid var(--color-surface-1)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
            {label}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
            {assignedAthletes.length > 0
              ? assignedAthletes.map(a => a.first_name).join(', ')
              : `AI will decide · ${desc}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          {assignedAthletes.length > 0 ? 'Edit' : 'Assign'}
        </Button>
      </div>

      {open && (
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
            width: '100%', maxWidth: 460,
            maxHeight: '80vh',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--color-surface-2)' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                {label} — Select Players
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
                {selected.length} selected · Leave empty for AI auto-fill
              </p>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {athletes.filter(a => a.primary_position !== 'Goalie').map(a => {
                const checked = selected.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => togglePlayer(a.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                      width: '100%', padding: 'var(--sp-3) var(--sp-5)',
                      background: checked ? 'var(--color-gold-muted)' : 'none',
                      border: 'none', borderBottom: '1px solid var(--color-surface-1)',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'background var(--ease-fast)',
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                      border: checked ? '2px solid var(--color-gold)' : '2px solid var(--color-surface-3)',
                      background: checked ? 'var(--color-gold)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked && <span style={{ color: '#000', fontSize: 12, fontWeight: 700 }}>✓</span>}
                    </span>
                    <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', minWidth: 24, textAlign: 'right' }}>
                      #{a.jersey_number ?? '—'}
                    </span>
                    <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                      {a.first_name} {a.last_name}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {a.primary_position || '—'}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ padding: 'var(--sp-3) var(--sp-5)', borderTop: '1px solid var(--color-surface-2)', display: 'flex', gap: 'var(--sp-2)' }}>
              <Button variant="outline" size="sm" onClick={handleClear} style={{ flex: 1 }}>Clear (AI decides)</Button>
              <Button variant="primary" size="sm" onClick={handleSave} style={{ flex: 1 }}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── GameSetup ─────────────────────────────────────────────────────────────────

/**
 * Pre-game setup screen.
 * Shows when a game's status is 'scheduled'.
 * Two tabs: Lineup (assign starters to positions) and Situations (assign player sets).
 */
export default function GameSetup({ game, onGameStarted }) {
  const [tab, setTab] = useState('lineup');
  const {
    athletes, lineup, assignments, loading, starting, error,
    assignToPosition, clearPosition,
    saveSituationAssignment, clearSituationAssignment,
    startGame,
  } = useGameSetup(game);

  const [pickerSlot, setPickerSlot] = useState(null);

  // Track the linked scouting roster id locally so switching between tabs
  // after linking still picks up the scouting roster on re-mount.
  const [opposingTeamIdLocal, setOpposingTeamIdLocal] = useState(game.opposing_team_id);
  useEffect(() => { setOpposingTeamIdLocal(game.opposing_team_id); }, [game.opposing_team_id]);

  const positions = POSITION_LAYOUT[game.format] || POSITION_LAYOUT.standard;
  const situations = game.format === '6s' ? SITUATION_TYPES_6S : SITUATION_TYPES;

  // Players already assigned somewhere in the lineup (for exclusion in picker)
  const assignedIds = Object.values(lineup).filter(Boolean);

  function getAthlete(id) {
    return athletes.find(a => a.id === id);
  }

  async function handleStart() {
    const result = await startGame();
    if (result?.success) onGameStarted?.();
  }

  if (loading) {
    return (
      <div className="page-content">
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>
          Loading roster…
        </p>
      </div>
    );
  }

  // Group positions by position group for display
  const groups = {};
  for (const pos of positions) {
    if (!groups[pos.group]) groups[pos.group] = [];
    groups[pos.group].push(pos);
  }

  return (
    <div className="page-content">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Game <span>Setup</span></h1>
          <p className="page-subtitle">vs {game.opponent}</p>
        </div>
        <Button
          variant="primary"
          onClick={handleStart}
          disabled={starting}
          style={{ minWidth: 140 }}
        >
          {starting ? 'Starting…' : '▶ Start Game'}
        </Button>
      </div>

      {error && (
        <div style={{
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--color-red-bg)',
          border: '1px solid var(--color-red-border)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--sp-4)',
          color: 'var(--color-red)',
          fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 'var(--text-sm)',
        }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--sp-5)', borderBottom: '1px solid var(--color-surface-2)' }}>
        {['lineup', 'situations', 'scouting'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: 'var(--font-body)', fontWeight: 700,
              fontSize: 'var(--text-xs)', letterSpacing: '1.5px',
              textTransform: 'uppercase', cursor: 'pointer',
              background: 'none', border: 'none',
              color: tab === t ? 'var(--color-gold)' : 'var(--color-text-muted)',
              borderBottom: tab === t ? '2px solid var(--color-gold)' : '2px solid transparent',
              padding: 'var(--sp-3) var(--sp-4)',
              transition: 'all var(--ease-base)',
              minHeight: 44,
            }}
          >
            {t === 'lineup' ? 'Lineup' : t === 'situations' ? 'Situations' : 'Scouting'}
          </button>
        ))}
      </div>

      {/* ── Lineup Tab ───────────────────────────────────────────────────── */}
      {tab === 'lineup' && (
        <>
          <p className="section-heading">
            Assign starters · {assignedIds.length}/{positions.length} set
          </p>

          {Object.entries(groups).map(([group, slots]) => {
            const colors = GROUP_COLORS[group] || GROUP_COLORS.Goalie;
            return (
              <div key={group} style={{ marginBottom: 'var(--sp-4)' }}>
                <p style={{
                  fontFamily: 'var(--font-body)', fontWeight: 700,
                  fontSize: 'var(--text-xs)', letterSpacing: '1.5px',
                  textTransform: 'uppercase', color: colors.text,
                  marginBottom: 'var(--sp-2)',
                }}>
                  {group}
                </p>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${slots.length}, 1fr)`,
                  gap: 'var(--sp-2)',
                }}>
                  {slots.map(({ slot, label }) => {
                    const athleteId = lineup[slot];
                    const athlete   = athleteId ? getAthlete(athleteId) : null;
                    return (
                      <button
                        key={slot}
                        onClick={() => setPickerSlot(slot)}
                        style={{
                          padding: 'var(--sp-3)',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${athlete ? colors.border : 'var(--color-surface-2)'}`,
                          background: athlete ? colors.bg : 'var(--color-surface-1)',
                          cursor: 'pointer', textAlign: 'center',
                          transition: 'all var(--ease-fast)',
                          minHeight: 72,
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          gap: 'var(--sp-1)',
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-xs)', color: colors.text, letterSpacing: 1 }}>
                          {label}
                        </span>
                        {athlete ? (
                          <>
                            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
                              {athlete.first_name}
                            </span>
                            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                              #{athlete.jersey_number ?? '—'}
                            </span>
                          </>
                        ) : (
                          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
                            Tap to assign
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Bench (unassigned) */}
          <p className="section-heading" style={{ marginTop: 'var(--sp-6)' }}>Bench</p>
          <div className="card" style={{ padding: 'var(--sp-3)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
              {athletes
                .filter(a => !assignedIds.includes(a.id))
                .map(a => (
                  <div key={a.id} style={{
                    padding: 'var(--sp-2) var(--sp-3)',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-surface-3)',
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
                  }}>
                    <span style={{ fontFamily: 'var(--font-stats)', fontSize: 11, color: 'var(--color-text-muted)' }}>
                      #{a.jersey_number ?? '—'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
                      {a.first_name} {a.last_name}
                    </span>
                  </div>
                ))}
              {athletes.filter(a => !assignedIds.includes(a.id)).length === 0 && (
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)', padding: 'var(--sp-2)' }}>
                  All players assigned
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Situations Tab ───────────────────────────────────────────────── */}
      {tab === 'situations' && (
        <>
          <p className="section-heading">
            Assign player sets per situation · leave empty for AI auto-fill
          </p>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {situations.map(s => (
              <SituationRow
                key={s.key}
                situationType={s.key}
                label={s.label}
                desc={s.desc}
                athletes={athletes}
                playerIds={assignments[s.key] || []}
                onSave={saveSituationAssignment}
                onClear={clearSituationAssignment}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Scouting Tab ─────────────────────────────────────────────────── */}
      {tab === 'scouting' && (
        <ScoutingTab
          game={{ ...game, opposing_team_id: opposingTeamIdLocal }}
          onGameUpdated={(newId) => setOpposingTeamIdLocal(newId)}
        />
      )}

      {/* Player picker modal */}
      {pickerSlot && (
        <PlayerPicker
          athletes={athletes}
          excludeIds={assignedIds.filter(id => id !== lineup[pickerSlot])}
          onSelect={id => { assignToPosition(pickerSlot, id); setPickerSlot(null); }}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}
