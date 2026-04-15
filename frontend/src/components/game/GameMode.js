import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useGames, useGame } from '../../hooks/useGame';
import { useGameSocket } from '../../hooks/useGameSocket';
import Badge from '../common/Badge';
import Button from '../common/Button';

const PERIODS = ['1st', '2nd', '3rd', '4th', 'OT'];

function formatClock(seconds) {
  if (seconds === null || seconds === undefined) return '—:——';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── No game selected — pick from schedule ───────────────────────────────────

function GamePicker({ teamId }) {
  const { games, loading, scheduleGame } = useGames(teamId);
  const [creating, setCreating] = useState(false);
  const [opponent, setOpponent] = useState('');

  const upcoming = games.filter(g => g.status !== 'completed');

  async function handleCreate(e) {
    e.preventDefault();
    if (!opponent.trim()) return;
    setCreating(true);
    try {
      await scheduleGame({ opponent: opponent.trim() });
      setOpponent('');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Game <span>Mode</span></h1>
          <p className="page-subtitle">Select or create a game to begin</p>
        </div>
      </div>

      {/* Quick create */}
      <p className="section-heading">New Game</p>
      <div className="card" style={{ marginBottom: 'var(--sp-8)' }}>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <input
            placeholder="Opponent name"
            value={opponent}
            onChange={e => setOpponent(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button type="submit" variant="primary" disabled={creating || !opponent.trim()}>
            {creating ? 'Creating…' : 'Start Game'}
          </Button>
        </form>
      </div>

      {/* Upcoming */}
      <p className="section-heading">Scheduled Games</p>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && <p style={{ padding: 'var(--sp-6)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>Loading…</p>}
        {!loading && upcoming.length === 0 && (
          <p style={{ padding: 'var(--sp-6)', color: 'var(--color-text-subtle)', fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)' }}>
            No scheduled games. Create one above.
          </p>
        )}
        {upcoming.map((g, i) => (
          <div key={g.id} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
            padding: 'var(--sp-4) var(--sp-5)',
            borderBottom: i < upcoming.length - 1 ? '1px solid var(--color-surface-2)' : 'none',
          }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                vs {g.opponent}
              </p>
              {g.game_date && (
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {new Date(g.game_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
              )}
            </div>
            <Badge variant="amber">{g.status}</Badge>
            <Button variant="outline" size="sm" onClick={() => window.location.href = `/game/${g.id}`}>
              Open
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Live game scoreboard ────────────────────────────────────────────────────

export default function GameMode() {
  const { gameId }    = useParams();
  const { team }      = useAuth();
  const token         = localStorage.getItem('token');

  const { game, loading, updateScore, updateStatus } = useGame(gameId);
  const {
    connected, liveState, clockTime,
    startClock, stopClock,
  } = useGameSocket(gameId, token);

  // Local score state — syncs from DB and socket
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [period,    setPeriod]    = useState(1);
  const [clockRunning, setClockRunning] = useState(false);

  useEffect(() => {
    if (game) {
      setHomeScore(game.score_home ?? 0);
      setAwayScore(game.score_away ?? 0);
    }
  }, [game]);

  useEffect(() => {
    if (liveState) {
      setHomeScore(liveState.homeScore ?? 0);
      setAwayScore(liveState.awayScore ?? 0);
      setPeriod(liveState.period ?? 1);
      setClockRunning(liveState.clockRunning ?? false);
    }
  }, [liveState]);

  // Show game picker if no gameId
  if (!gameId) return <GamePicker teamId={team?.id} />;
  if (loading)  return <div className="page-content"><p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>Loading game…</p></div>;

  const leading = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'tied';
  const displayClock = clockTime !== null ? formatClock(clockTime) : '——:——';

  function adjustScore(side, delta) {
    const next = Math.max(0, (side === 'home' ? homeScore : awayScore) + delta);
    if (side === 'home') {
      setHomeScore(next);
      updateScore(next, awayScore);
    } else {
      setAwayScore(next);
      updateScore(homeScore, next);
    }
  }

  function toggleClock() {
    if (clockRunning) {
      stopClock();
      setClockRunning(false);
    } else {
      startClock();
      setClockRunning(true);
    }
  }

  function ScoreControl({ score, side }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-4)' }}>
        <button onClick={() => adjustScore(side, -1)} style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-1)', border: '1px solid var(--color-surface-3)', color: 'var(--color-text-muted)', fontWeight: 700, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-4xl)', color: 'var(--color-text-primary)', lineHeight: 1, minWidth: 64, textAlign: 'center' }}>
          {score}
        </span>
        <button onClick={() => adjustScore(side, 1)} style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--color-gold-muted)', border: '1px solid var(--color-gold-border)', color: 'var(--color-gold)', fontWeight: 700, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>
    );
  }

  return (
    <div className="page-content">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Game <span>Mode</span></h1>
          <p className="page-subtitle">vs {game?.opponent ?? '—'}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
          {connected && <Badge variant="green" dot>Live</Badge>}
          <Badge variant={leading === 'home' ? 'green' : leading === 'away' ? 'red' : 'amber'} dot>
            {leading === 'tied' ? 'Tied' : leading === 'home' ? 'Leading' : 'Trailing'}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => updateStatus('completed')}>End Game</Button>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="card" style={{ marginBottom: 'var(--sp-8)' }}>

        {/* Period tabs */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
          {PERIODS.map((p, i) => (
            <span key={p} onClick={() => setPeriod(i + 1)} style={{
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
              letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer',
              color: i + 1 === period ? 'var(--color-gold)' : 'var(--color-surface-3)',
              borderBottom: i + 1 === period ? '2px solid var(--color-gold)' : '2px solid transparent',
              paddingBottom: 4, transition: 'all var(--ease-base)',
            }}>
              {p}
            </span>
          ))}
        </div>

        {/* Clock */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--sp-5)' }}>
          <p style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-2xl)', color: clockRunning ? 'var(--color-text-primary)' : 'var(--color-text-muted)', letterSpacing: 3 }}>
            {displayClock}
          </p>
          <button onClick={toggleClock} style={{
            marginTop: 'var(--sp-3)', padding: '6px var(--sp-5)', borderRadius: 'var(--radius-full)',
            background: clockRunning ? 'var(--color-red-bg)' : 'var(--color-green-bg)',
            border: clockRunning ? '1px solid var(--color-red-border)' : '1px solid var(--color-green-border)',
            color: clockRunning ? 'var(--color-red)' : 'var(--color-green)',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
            letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer',
            transition: 'all var(--ease-base)',
          }}>
            {clockRunning ? '⏸ Pause' : '▶ Start Clock'}
          </button>
        </div>

        {/* Score controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 'var(--sp-8)' }}>
          <div style={{ textAlign: 'center' }}>
            <p className="label" style={{ marginBottom: 'var(--sp-3)' }}>{team?.teamName || 'Home'}</p>
            <ScoreControl score={homeScore} side="home" />
          </div>
          <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-3xl)', color: 'var(--color-surface-3)' }}>—</span>
          <div style={{ textAlign: 'center' }}>
            <p className="label" style={{ marginBottom: 'var(--sp-3)' }}>{game?.opponent || 'Away'}</p>
            <ScoreControl score={awayScore} side="away" />
          </div>
        </div>

      </div>

      {/* Quick actions */}
      <p className="section-heading">Quick Actions</p>
      <div className="grid-4">
        {[
          { label: 'Timeout',    variant: 'secondary' },
          { label: 'Sub In/Out', variant: 'secondary' },
          { label: 'Flag Play',  variant: 'outline'   },
          { label: 'Ask AI',     variant: 'primary'   },
        ].map(({ label, variant }) => (
          <Button key={label} variant={variant} style={{ width: '100%', justifyContent: 'center' }}>
            {label}
          </Button>
        ))}
      </div>

    </div>
  );
}
