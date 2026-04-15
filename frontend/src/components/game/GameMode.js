import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useGames, useGame } from '../../hooks/useGame';
import { useGameSocket } from '../../hooks/useGameSocket';
import { useLines } from '../../hooks/useLines';
import { useRoster } from '../../hooks/useRoster';
import Badge from '../common/Badge';
import Button from '../common/Button';
import GameSetup from './GameSetup';
import StagingPanel from './StagingPanel';

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
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [opponent, setOpponent] = useState('');

  const upcoming = games.filter(g => g.status !== 'completed');

  async function handleCreate(e) {
    e.preventDefault();
    if (!opponent.trim()) return;
    setCreating(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const game  = await scheduleGame({ opponent: opponent.trim(), gameDate: today });
      navigate(`/game/${game.id}`);
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
        <form
          onSubmit={handleCreate}
          style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}
        >
          <input
            placeholder="Opponent name"
            value={opponent}
            onChange={e => setOpponent(e.target.value)}
            style={{ flex: 1, minWidth: 160 }}
          />
          <Button type="submit" variant="primary" disabled={creating || !opponent.trim()} style={{ flexShrink: 0 }}>
            {creating ? 'Creating…' : 'Start Game'}
          </Button>
        </form>
      </div>

      {/* Upcoming */}
      <p className="section-heading">Scheduled Games</p>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && (
          <p style={{ padding: 'var(--sp-6)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>
            Loading…
          </p>
        )}
        {!loading && upcoming.length === 0 && (
          <p style={{ padding: 'var(--sp-6)', color: 'var(--color-text-subtle)', fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)' }}>
            No scheduled games. Create one above.
          </p>
        )}
        {upcoming.map((g, i) => (
          <div key={g.id} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
            padding: 'var(--sp-4) var(--sp-5)',
            borderBottom: i < upcoming.length - 1 ? '1px solid var(--color-surface-2)' : 'none',
            flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
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
            <Button variant="outline" size="sm" onClick={() => navigate(`/game/${g.id}`)}>Open</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Score control — large touch targets ─────────────────────────────────────

function ScoreControl({ score, side, onAdjust }) {
  const btnBase = {
    borderRadius: 'var(--radius-md)',
    fontWeight: 700,
    fontSize: 22,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all var(--ease-fast)',
    // Apple HIG: minimum 44pt, but score controls warrant larger
    width:  'clamp(44px, 12vw, 60px)',
    height: 'clamp(44px, 12vw, 60px)',
    flexShrink: 0,
    userSelect: 'none',
    WebkitTouchCallout: 'none',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-4)' }}>
      {/* Minus */}
      <button
        onClick={() => onAdjust(side, -1)}
        style={{
          ...btnBase,
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-surface-3)',
          color: 'var(--color-text-muted)',
        }}
        onPointerDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
        onPointerUp={e => e.currentTarget.style.transform   = 'scale(1)'}
        onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        aria-label={`Decrease ${side} score`}
      >
        −
      </button>

      {/* Score display */}
      <span style={{
        fontFamily: 'var(--font-stats)',
        fontSize: 'clamp(var(--text-3xl), 10vw, var(--text-4xl))',
        color: 'var(--color-text-primary)',
        lineHeight: 1,
        minWidth: 'clamp(52px, 12vw, 76px)',
        textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {score}
      </span>

      {/* Plus */}
      <button
        onClick={() => onAdjust(side, 1)}
        style={{
          ...btnBase,
          background: 'var(--color-gold-muted)',
          border: '1px solid var(--color-gold-border)',
          color: 'var(--color-gold)',
        }}
        onPointerDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
        onPointerUp={e => e.currentTarget.style.transform   = 'scale(1)'}
        onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        aria-label={`Increase ${side} score`}
      >
        +
      </button>
    </div>
  );
}

// ─── Live game scoreboard ─────────────────────────────────────────────────────

export default function GameMode() {
  const { gameId } = useParams();
  const { team }   = useAuth();
  const token      = localStorage.getItem('token');

  const { game, loading, updateScore, updateStatus, refresh: refreshGame } = useGame(gameId);
  const {
    connected, liveState, clockTime, mergeAlerts, activating,
    startClock, stopClock,
    addToQueue, removeFromQueue, removeMoveFromQueue, activateQueue,
  } = useGameSocket(gameId, token);

  const { lines } = useLines(team?.id);
  const { athletes } = useRoster(team?.id);

  const [homeScore,    setHomeScore]    = useState(0);
  const [awayScore,    setAwayScore]    = useState(0);
  const [period,       setPeriod]       = useState(1);
  const [clockRunning, setClockRunning] = useState(false);

  useEffect(() => {
    if (game) {
      setHomeScore(game.score_home ?? 0);
      setAwayScore(game.score_away ?? 0);
    }
  }, [game]);

  useEffect(() => {
    if (liveState) {
      setHomeScore(liveState.homeScore    ?? 0);
      setAwayScore(liveState.awayScore    ?? 0);
      setPeriod(liveState.period          ?? 1);
      setClockRunning(liveState.clockRunning ?? false);
    }
  }, [liveState]);

  if (!gameId) return <GamePicker teamId={team?.id} />;
  if (loading)  return (
    <div className="page-content">
      <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>Loading game…</p>
    </div>
  );

  // ── Pre-game setup (game not yet started) ────────────────────────────────
  if (game?.status === 'scheduled') {
    return (
      <GameSetup
        game={game}
        onGameStarted={() => refreshGame()}
      />
    );
  }

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
    if (clockRunning) { stopClock(); setClockRunning(false); }
    else              { startClock(); setClockRunning(true); }
  }

  return (
    <div className="page-content">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Game <span>Mode</span></h1>
          <p className="page-subtitle">vs {game?.opponent ?? '—'}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          {connected && <Badge variant="green" dot>Live</Badge>}
          <Badge variant={leading === 'home' ? 'green' : leading === 'away' ? 'red' : 'amber'} dot>
            {leading === 'tied' ? 'Tied' : leading === 'home' ? 'Leading' : 'Trailing'}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => updateStatus('completed')}>End Game</Button>
        </div>
      </div>

      {/* ── Scoreboard ──────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 'var(--sp-6)' }}>

        {/* Period selector */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 'clamp(var(--sp-3), 4vw, var(--sp-6))',
          marginBottom: 'var(--sp-5)',
        }}>
          {PERIODS.map((p, i) => (
            <button
              key={p}
              onClick={() => setPeriod(i + 1)}
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 700,
                fontSize: 'var(--text-xs)',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                color: i + 1 === period ? 'var(--color-gold)' : 'var(--color-surface-3)',
                borderBottom: i + 1 === period ? '2px solid var(--color-gold)' : '2px solid transparent',
                paddingBottom: 4,
                transition: 'all var(--ease-base)',
                /* Expanded touch target */
                paddingTop: 8,
                paddingLeft: 'clamp(var(--sp-2), 2vw, var(--sp-3))',
                paddingRight: 'clamp(var(--sp-2), 2vw, var(--sp-3))',
                minHeight: 44,
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Clock */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--sp-5)' }}>
          <p style={{
            fontFamily: 'var(--font-stats)',
            fontSize: 'clamp(var(--text-xl), 8vw, var(--text-2xl))',
            color: clockRunning ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            letterSpacing: 3,
          }}>
            {displayClock}
          </p>
          <button
            onClick={toggleClock}
            style={{
              marginTop: 'var(--sp-3)',
              padding: 'var(--sp-3) var(--sp-6)',
              borderRadius: 'var(--radius-full)',
              background: clockRunning ? 'var(--color-red-bg)' : 'var(--color-green-bg)',
              border: clockRunning ? '1px solid var(--color-red-border)' : '1px solid var(--color-green-border)',
              color: clockRunning ? 'var(--color-red)' : 'var(--color-green)',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: 'var(--text-xs)',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all var(--ease-base)',
              minHeight: 44,
              minWidth: 140,
            }}
          >
            {clockRunning ? '⏸ Pause' : '▶ Start Clock'}
          </button>
        </div>

        {/* Score controls */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 'clamp(var(--sp-4), 4vw, var(--sp-8))',
        }}>
          <div style={{ textAlign: 'center' }}>
            <p className="label" style={{ marginBottom: 'var(--sp-3)', fontSize: 'var(--text-xs)' }}>
              {team?.teamName || 'Home'}
            </p>
            <ScoreControl score={homeScore} side="home" onAdjust={adjustScore} />
          </div>

          <span style={{
            fontFamily: 'var(--font-stats)',
            fontSize: 'clamp(var(--text-xl), 6vw, var(--text-3xl))',
            color: 'var(--color-surface-3)',
          }}>
            —
          </span>

          <div style={{ textAlign: 'center' }}>
            <p className="label" style={{ marginBottom: 'var(--sp-3)', fontSize: 'var(--text-xs)' }}>
              {game?.opponent || 'Away'}
            </p>
            <ScoreControl score={awayScore} side="away" onAdjust={adjustScore} />
          </div>
        </div>

      </div>

      {/* ── Quick Actions ────────────────────────────────── */}
      <p className="section-heading">Quick Actions</p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 'var(--sp-3)',
        marginBottom: 'var(--sp-6)',
      }}>
        {[
          { label: 'Timeout',  variant: 'secondary' },
          { label: 'Flag Play', variant: 'outline'  },
          { label: 'Ask AI',   variant: 'primary'   },
        ].map(({ label, variant }) => (
          <Button
            key={label}
            variant={variant}
            style={{ width: '100%', justifyContent: 'center', minHeight: 52 }}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* ── Substitution Staging ─────────────────────────── */}
      <div className="card" style={{ padding: 'var(--sp-5)' }}>
        <StagingPanel
          gameId={gameId}
          gameFormat={game?.format || 'standard'}
          liveState={liveState}
          athletes={athletes}
          lines={lines}
          mergeAlerts={mergeAlerts}
          onAddToQueue={addToQueue}
          onRemoveEntry={removeFromQueue}
          onRemoveMove={removeMoveFromQueue}
          onActivate={activateQueue}
          activating={activating}
        />
      </div>

    </div>
  );
}
