import React, { useMemo, useState } from 'react';
import apiClient from '../../config/api';
import Button from '../common/Button';
import { useOpposingScouting } from '../../hooks/useOpposing';

/**
 * ScoutingTab — pre-game film-session ingest for an opposing team.
 *
 * Links (or creates) an opposing_team scouting roster for the current game,
 * then lets the coach enter opposing players plus film-session stat totals.
 * The same rows drive the P6 threat calculator during Game Mode.
 *
 * The main flow:
 *   1. If the game has no opposing_team_id, "Link scouting roster" runs the
 *      find-or-create lookup against the opponent string and PATCHes the game.
 *   2. Once linked, the coach builds a roster with Quick Add or Bulk Paste.
 *   3. Each row has inline Goals / Assists / SOG / GB / CT inputs; changes
 *      are persisted on blur via PUT film-stats.
 *
 * Only the five event types that drive the threat score are editable inline;
 * the rest default to 0 and can be added later via REST if needed.
 */

// Threat-score-driving stats. See opponentScoutingService BASE_WEIGHTS —
// these five account for ~95% of the score in practice.
const STAT_COLS = [
  { key: 'goals',             short: 'G'   },
  { key: 'assists',           short: 'A'   },
  { key: 'shots_on_goal',     short: 'SOG' },
  { key: 'ground_balls',      short: 'GB'  },
  { key: 'caused_turnovers',  short: 'CT'  },
];

// Map DB column name → PUT body field (camelCase per route schema).
const STAT_BODY_KEY = {
  goals:            'goals',
  assists:          'assists',
  shots_on_goal:    'shotsOnGoal',
  ground_balls:     'groundBalls',
  caused_turnovers: 'causedTurnovers',
};

const POSITIONS = ['Attack', 'Midfield', 'Defense', 'Goalie', 'FOGO'];

export default function ScoutingTab({ game, onGameUpdated }) {
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState(null);
  const {
    opposingTeam, players, filmStatsMap, loading, error,
    lookupOpposingTeam, bulkAddPlayers, addPlayer, updatePlayer, removePlayer,
    saveFilmStats,
  } = useOpposingScouting(game.team_id, game.opposing_team_id);

  // ── Link-scouting-roster flow ──────────────────────────────────────────────
  async function handleLink() {
    setLinking(true);
    setLinkError(null);
    try {
      const team = await lookupOpposingTeam(game.opponent);
      if (!team) return;
      // Persist the link on the game so the Game Mode threat panel finds it.
      await apiClient.patch(`/games/${game.id}`, { opposingTeamId: team.id });
      onGameUpdated?.(team.id);
    } catch (err) {
      setLinkError(err.response?.data?.error || err.message);
    } finally {
      setLinking(false);
    }
  }

  // ── Quick Add row state ────────────────────────────────────────────────────
  const [quickJersey, setQuickJersey] = useState('');
  const [quickName,   setQuickName]   = useState('');
  const [quickPos,    setQuickPos]    = useState('');
  async function handleQuickAdd(e) {
    e.preventDefault();
    if (!quickName.trim() && !quickJersey.trim()) return;
    await addPlayer({
      jerseyNumber:   quickJersey.trim() === '' ? null : Number(quickJersey),
      displayName:    quickName.trim() || undefined,
      primaryPosition: quickPos || undefined,
    });
    setQuickJersey(''); setQuickName(''); setQuickPos('');
  }

  // ── Bulk Paste ─────────────────────────────────────────────────────────────
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteMsg,  setPasteMsg]  = useState(null);

  async function handleBulkPaste() {
    // Parse "#, Name, Position" per line. Tolerant of tabs, commas, or 2+ spaces.
    const rows = pasteText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const parts = line.split(/\t|,|\s{2,}/).map(s => s.trim()).filter(Boolean);
        // First numeric field is jersey; first word-with-letters is name.
        let jersey = null;
        let name   = '';
        let pos    = null;
        for (const p of parts) {
          if (jersey === null && /^\d{1,3}$/.test(p)) {
            jersey = Number(p);
          } else if (!pos && POSITIONS.some(q => q.toLowerCase() === p.toLowerCase())) {
            pos = POSITIONS.find(q => q.toLowerCase() === p.toLowerCase());
          } else {
            name = name ? `${name} ${p}` : p;
          }
        }
        return {
          jerseyNumber:    jersey,
          displayName:     name || undefined,
          primaryPosition: pos || undefined,
        };
      })
      .filter(p => p.displayName || p.jerseyNumber !== null);

    if (rows.length === 0) {
      setPasteMsg('Nothing to import — paste rows like "23, Smith, Attack"');
      return;
    }
    setPasteBusy(true);
    setPasteMsg(null);
    try {
      const result = await bulkAddPlayers(rows);
      setPasteMsg(`Added ${result.inserted}, skipped ${result.skipped} duplicates.`);
      setPasteText('');
    } catch (err) {
      setPasteMsg(err.response?.data?.error || 'Import failed');
    } finally {
      setPasteBusy(false);
    }
  }

  // ── Per-row inline stat edit ───────────────────────────────────────────────
  function statValue(playerId, col) {
    return filmStatsMap[playerId]?.[col] ?? 0;
  }

  async function handleStatChange(playerId, col, nextVal) {
    const num = Math.max(0, Number(nextVal) || 0);
    if (num === statValue(playerId, col)) return;
    await saveFilmStats(playerId, { [STAT_BODY_KEY[col]]: num });
  }

  async function handleNameCommit(player, nextVal) {
    const trimmed = nextVal.trim();
    if (trimmed === (player.display_name || '')) return;
    await updatePlayer(player.id, { displayName: trimmed || null });
  }

  async function handleJerseyCommit(player, nextVal) {
    const num = nextVal.trim() === '' ? null : Number(nextVal);
    if (num === player.jersey_number) return;
    await updatePlayer(player.id, { jerseyNumber: num });
  }

  async function handlePosCommit(player, nextVal) {
    const val = nextVal || null;
    if (val === player.primary_position) return;
    await updatePlayer(player.id, { primaryPosition: val });
  }

  // Sort by jersey (nulls last), then name.
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const aj = a.jersey_number ?? 9999;
      const bj = b.jersey_number ?? 9999;
      if (aj !== bj) return aj - bj;
      return (a.display_name || '').localeCompare(b.display_name || '');
    });
  }, [players]);

  // ── Un-linked state: big CTA to pull the scouting roster ──────────────────
  if (!opposingTeam) {
    return (
      <div className="card" style={{ padding: 'var(--sp-6)' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)',
          color: 'var(--color-text-primary)', marginBottom: 'var(--sp-2)',
        }}>
          No scouting roster linked for {game.opponent}
        </p>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)', marginBottom: 'var(--sp-4)',
        }}>
          Link or create a scouting roster so film-session stats and threat
          badges are available before tip-off.
        </p>
        {linkError && (
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
            color: 'var(--color-red)', marginBottom: 'var(--sp-3)',
          }}>
            {linkError}
          </p>
        )}
        <Button variant="primary" onClick={handleLink} disabled={linking}>
          {linking ? 'Linking…' : `Link roster for "${game.opponent}"`}
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Header — team name + count + bulk paste toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 'var(--sp-3)',
      }}>
        <div>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)',
            color: 'var(--color-text-primary)',
          }}>
            {opposingTeam.name} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>·
              {players.length} scouted</span>
          </p>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)', marginTop: 2,
          }}>
            Enter season totals from film — live game events add on top during play.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPasteOpen(o => !o)}>
          {pasteOpen ? 'Close Paste' : 'Bulk Paste'}
        </Button>
      </div>

      {error && (
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          color: 'var(--color-red)', marginBottom: 'var(--sp-3)',
        }}>
          {error}
        </p>
      )}

      {/* Bulk paste panel */}
      {pasteOpen && (
        <div className="card" style={{ marginBottom: 'var(--sp-4)', padding: 'var(--sp-4)' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
            letterSpacing: '1.5px', textTransform: 'uppercase',
            color: 'var(--color-text-muted)', marginBottom: 'var(--sp-2)',
          }}>
            Paste roster — one per line
          </p>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={`23, Smith, Attack\n7  Jones  Midfield\n14, Carter`}
            rows={6}
            style={{
              width: '100%', boxSizing: 'border-box',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
              padding: 'var(--sp-3)', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', alignItems: 'center' }}>
            <Button variant="primary" size="sm" onClick={handleBulkPaste} disabled={pasteBusy}>
              {pasteBusy ? 'Importing…' : 'Import'}
            </Button>
            {pasteMsg && (
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                color: 'var(--color-text-muted)',
              }}>
                {pasteMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Quick add inline row */}
      <form onSubmit={handleQuickAdd} className="card"
        style={{
          display: 'grid',
          gridTemplateColumns: '60px 1fr 120px 80px',
          gap: 'var(--sp-2)',
          padding: 'var(--sp-3)',
          alignItems: 'center',
          marginBottom: 'var(--sp-3)',
        }}
      >
        <input
          type="number" min="0" max="999"
          value={quickJersey} onChange={e => setQuickJersey(e.target.value)}
          placeholder="#" style={{ width: '100%', boxSizing: 'border-box' }}
        />
        <input
          value={quickName} onChange={e => setQuickName(e.target.value)}
          placeholder="Player name" style={{ width: '100%', boxSizing: 'border-box' }}
        />
        <select value={quickPos} onChange={e => setQuickPos(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box' }}
        >
          <option value="">Pos</option>
          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <Button variant="primary" size="sm" type="submit">Add</Button>
      </form>

      {/* Roster + stats table */}
      {loading && players.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>
          Loading scouting data…
        </p>
      ) : players.length === 0 ? (
        <p style={{
          padding: 'var(--sp-4)', color: 'var(--color-text-subtle)',
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)',
          textAlign: 'center',
        }}>
          No players yet — use Quick Add or Bulk Paste to start.
        </p>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '60px 1fr 110px repeat(5, 56px) 40px',
            gap: 'var(--sp-2)',
            padding: 'var(--sp-3)',
            borderBottom: '1px solid var(--color-surface-2)',
            background: 'var(--color-surface-1)',
          }}>
            <HeaderCell>#</HeaderCell>
            <HeaderCell>Name</HeaderCell>
            <HeaderCell>Pos</HeaderCell>
            {STAT_COLS.map(c => <HeaderCell key={c.key}>{c.short}</HeaderCell>)}
            <HeaderCell>{' '}</HeaderCell>
          </div>
          {sortedPlayers.map(p => (
            <div key={p.id} style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 110px repeat(5, 56px) 40px',
              gap: 'var(--sp-2)',
              padding: 'var(--sp-2) var(--sp-3)',
              alignItems: 'center',
              borderBottom: '1px solid var(--color-surface-1)',
            }}>
              <EditableNumber
                value={p.jersey_number}
                onCommit={v => handleJerseyCommit(p, v)}
              />
              <EditableText
                value={p.display_name || ''}
                onCommit={v => handleNameCommit(p, v)}
              />
              <select
                value={p.primary_position || ''}
                onChange={e => handlePosCommit(p, e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              >
                <option value="">—</option>
                {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
              </select>
              {STAT_COLS.map(c => (
                <EditableNumber
                  key={c.key}
                  value={statValue(p.id, c.key)}
                  onCommit={v => handleStatChange(p.id, c.key, v)}
                />
              ))}
              <button
                onClick={() => removePlayer(p.id)}
                aria-label={`Remove ${p.display_name || 'player'}`}
                title="Remove"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-subtle)',
                  fontSize: 'var(--text-base)', lineHeight: 1,
                  minHeight: 36,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Small inline editing helpers ───────────────────────────────────────────

function HeaderCell({ children }) {
  return (
    <span style={{
      fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px',
      letterSpacing: '1.5px', textTransform: 'uppercase',
      color: 'var(--color-text-muted)',
    }}>
      {children}
    </span>
  );
}

function EditableText({ value, onCommit }) {
  const [local, setLocal] = useState(value);
  React.useEffect(() => { setLocal(value); }, [value]);
  return (
    <input
      type="text"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onCommit(local)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={{ width: '100%', boxSizing: 'border-box' }}
    />
  );
}

function EditableNumber({ value, onCommit }) {
  const [local, setLocal] = useState(value ?? '');
  React.useEffect(() => { setLocal(value ?? ''); }, [value]);
  return (
    <input
      type="number"
      min="0"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onCommit(local === '' ? null : local)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-stats)' }}
    />
  );
}
