import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useGames, useGame } from '../../hooks/useGame';
import { useGameSocket } from '../../hooks/useGameSocket';
import { useLines } from '../../hooks/useLines';
import { useRoster } from '../../hooks/useRoster';
import apiClient from '../../config/api';
import Badge from '../common/Badge';
import Button from '../common/Button';
import GameSetup from './GameSetup';
import StagingPanel from './StagingPanel';
import AICoachPanel from '../ai/AICoachPanel';

const PERIODS = ['1st', '2nd', '3rd', '4th', 'OT'];

// Default shot clock for 6s format (seconds); overridden by game.shot_clock_seconds
const DEFAULT_SHOT_CLOCK = 60;

function formatClock(seconds) {
  if (seconds === null || seconds === undefined) return '—:——';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Game picker (no game selected) ──────────────────────────────────────────

function GamePicker({ teamId }) {
  const { games, loading, scheduleGame } = useGames(teamId);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [opponent, setOpponent] = useState('');
  const [format,   setFormat]   = useState('standard');
  const [gameDate, setGameDate] = useState(new Date().toISOString().split('T')[0]);

  const upcoming = games.filter(g => g.status !== 'completed');

  async function handleCreate(e) {
    e.preventDefault();
    if (!opponent.trim()) return;
    setCreating(true);
    try {
      const game = await scheduleGame({ opponent: opponent.trim(), gameDate, format });
      navigate(`/game/${game.id}`);
    } finally {
      setCreating(false);
    }
  }

  const segBtn = (val, label) => ({
    flex: 1, padding: 'var(--sp-2) var(--sp-3)',
    border: '1px solid',
    borderColor: format === val ? 'var(--color-gold)' : 'var(--color-surface-3)',
    background:  format === val ? 'var(--color-gold-muted)' : 'transparent',
    color:       format === val ? 'var(--color-gold)' : 'var(--color-text-muted)',
    fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
    letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer',
    transition: 'all var(--ease-base)',
  });

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Game <span>Mode</span></h1>
          <p className="page-subtitle">Select or create a game to begin</p>
        </div>
      </div>

      <p className="section-heading">New Game</p>
      <div className="card" style={{ marginBottom: 'var(--sp-8)' }}>
        <form onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-1)' }}>
                Opponent
              </label>
              <input
                placeholder="Opponent name"
                value={opponent}
                onChange={e => setOpponent(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-1)' }}>
                Date
              </label>
              <input
                type="date"
                value={gameDate}
                onChange={e => setGameDate(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 'var(--sp-5)' }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-2)' }}>
              Format
            </label>
            <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <button type="button" onClick={() => setFormat('standard')} style={{ ...segBtn('standard'), borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)' }}>
                Standard (10v10)
              </button>
              <button type="button" onClick={() => setFormat('6s')} style={{ ...segBtn('6s'), borderLeft: 'none', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}>
                Lacrosse 6s
              </button>
            </div>
          </div>

          <Button type="submit" variant="primary" disabled={creating || !opponent.trim()} style={{ width: '100%' }}>
            {creating ? 'Creating…' : 'Create Game'}
          </Button>
        </form>
      </div>

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

// ─── Score control ────────────────────────────────────────────────────────────

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
    width:  'clamp(44px, 12vw, 60px)',
    height: 'clamp(44px, 12vw, 60px)',
    flexShrink: 0,
    userSelect: 'none',
    WebkitTouchCallout: 'none',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-4)' }}>
      <button
        onClick={() => onAdjust(side, -1)}
        style={{ ...btnBase, background: 'var(--color-surface-1)', border: '1px solid var(--color-surface-3)', color: 'var(--color-text-muted)' }}
        onPointerDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
        onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        aria-label={`Decrease ${side} score`}
      >−</button>

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

      <button
        onClick={() => onAdjust(side, 1)}
        style={{ ...btnBase, background: 'var(--color-gold-muted)', border: '1px solid var(--color-gold-border)', color: 'var(--color-gold)' }}
        onPointerDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
        onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        aria-label={`Increase ${side} score`}
      >+</button>
    </div>
  );
}

// ─── Shot clock (6s format only) ─────────────────────────────────────────────

function ShotClock({ initialSeconds }) {
  const [timeLeft, setTimeLeft]   = useState(initialSeconds);
  const [running,  setRunning]    = useState(false);
  const intervalRef               = useRef(null);

  // Reset when initialSeconds changes (e.g. game format loaded)
  useEffect(() => { setTimeLeft(initialSeconds); }, [initialSeconds]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  function reset() {
    clearInterval(intervalRef.current);
    setRunning(false);
    setTimeLeft(initialSeconds);
  }

  const urgent = timeLeft <= 10;
  const expired = timeLeft === 0;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--sp-3)',
      padding: 'var(--sp-3) var(--sp-4)',
      background: expired ? 'var(--color-red-bg)' : urgent ? 'rgba(239,68,68,0.08)' : 'var(--color-surface-1)',
      border: `1px solid ${expired ? 'var(--color-red-border)' : urgent ? 'rgba(239,68,68,0.3)' : 'var(--color-surface-2)'}`,
      borderRadius: 'var(--radius-md)',
    }}>
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
        Shot Clock
      </span>
      <span style={{
        fontFamily: 'var(--font-stats)',
        fontSize: 'var(--text-2xl)',
        color: expired ? 'var(--color-red)' : urgent ? '#f97316' : 'var(--color-text-primary)',
        minWidth: 44,
        textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: 2,
      }}>
        {timeLeft}
      </span>
      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginLeft: 'auto' }}>
        <button
          onClick={() => setRunning(r => !r)}
          style={{
            padding: 'var(--sp-2) var(--sp-3)',
            borderRadius: 'var(--radius-sm)',
            background: running ? 'var(--color-red-bg)' : 'var(--color-green-bg)',
            border: running ? '1px solid var(--color-red-border)' : '1px solid var(--color-green-border)',
            color: running ? 'var(--color-red)' : 'var(--color-green)',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
            cursor: 'pointer', minHeight: 36,
          }}
        >
          {running ? '⏸' : '▶'}
        </button>
        <button
          onClick={reset}
          style={{
            padding: 'var(--sp-2) var(--sp-3)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-surface-3)',
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
            cursor: 'pointer', minHeight: 36,
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ─── Stat logging sheet ───────────────────────────────────────────────────────

const STAT_EVENTS = [
  { type: 'goal',           label: 'Goal',        color: 'var(--color-gold)' },
  { type: 'assist',         label: 'Assist',      color: 'var(--color-gold)' },
  { type: 'shot',           label: 'Shot',        color: 'var(--color-blue)' },
  { type: 'ground_ball',    label: 'Ground Ball', color: 'var(--color-green)' },
  { type: 'turnover',       label: 'Turnover',    color: 'var(--color-red)' },
  { type: 'caused_turnover',label: 'Caused TO',   color: 'var(--color-green)' },
  { type: 'save',           label: 'Save',        color: 'var(--color-blue)' },
];

function StatLogger({ gameId, athletes, period, clockSeconds, onClose }) {
  const toast             = useToast();
  const [selected, setSelected] = useState(null); // athleteId
  const [logging,  setLogging]  = useState(false);

  const fieldPlayers = athletes || [];

  async function logStat(eventType) {
    if (!selected || !gameId) return;
    setLogging(true);
    try {
      await apiClient.post(`/game-live/${gameId}/event`, {
        eventType: eventType.toUpperCase(),
        athleteId: selected,
        metadata:  { period, clockSeconds },
      });
      toast.success(`${STAT_EVENTS.find(e => e.type === eventType)?.label || eventType} logged`);
      setSelected(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to log stat');
    } finally {
      setLogging(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      {/* Overlay */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'relative',
        background: 'var(--color-surface-0)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        padding: 'var(--sp-5)',
        maxHeight: '70dvh',
        overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: 'var(--color-surface-3)', borderRadius: 2, margin: '0 auto var(--sp-5)' }} />

        <p className="section-heading" style={{ marginBottom: 'var(--sp-4)' }}>
          {selected ? 'Tap the event to log' : 'Tap a player'}
        </p>

        {/* Player grid */}
        {!selected && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
            gap: 'var(--sp-2)',
            marginBottom: 'var(--sp-5)',
          }}>
            {fieldPlayers.map(a => (
              <button
                key={a.id}
                onClick={() => setSelected(a.id)}
                style={{
                  padding: 'var(--sp-3)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-1)',
                  border: '1px solid var(--color-surface-2)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all var(--ease-fast)',
                }}
                onPointerDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
                onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <div style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-xl)', color: 'var(--color-gold)' }}>
                  {a.jersey_number ?? '—'}
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.last_name}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Event buttons — shown after player is selected */}
        {selected && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
              marginBottom: 'var(--sp-4)',
              padding: 'var(--sp-3)',
              background: 'var(--color-gold-muted)',
              border: '1px solid var(--color-gold-border)',
              borderRadius: 'var(--radius-md)',
            }}>
              {(() => {
                const a = fieldPlayers.find(p => p.id === selected);
                return a ? (
                  <>
                    <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-lg)', color: 'var(--color-gold)' }}>
                      {a.jersey_number}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                      {a.first_name} {a.last_name}
                    </span>
                  </>
                ) : null;
              })()}
              <button
                onClick={() => setSelected(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 18 }}
              >
                ×
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
              gap: 'var(--sp-3)',
            }}>
              {STAT_EVENTS.map(ev => (
                <button
                  key={ev.type}
                  onClick={() => logStat(ev.type)}
                  disabled={logging}
                  style={{
                    padding: 'var(--sp-4)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface-1)',
                    border: `1px solid var(--color-surface-2)`,
                    cursor: logging ? 'wait' : 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 700,
                    fontSize: 'var(--text-sm)',
                    color: ev.color,
                    textAlign: 'center',
                    minHeight: 52,
                    transition: 'all var(--ease-fast)',
                    opacity: logging ? 0.5 : 1,
                  }}
                  onPointerDown={e => { if (!logging) e.currentTarget.style.transform = 'scale(0.95)'; }}
                  onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
                  onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {ev.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Faceoff tracker (standard format only) ───────────────────────────────────

function FaceoffTracker({ gameId, athletes, period }) {
  const toast = useToast();
  const [pickingResult, setPickingResult] = useState(null); // 'win' | 'loss'
  const [logging, setLogging] = useState(false);

  const fogos = athletes.filter(a =>
    a.primary_position === 'FOGO' || a.secondary_position === 'FOGO'
  );
  const options = fogos.length > 0 ? fogos : athletes;

  async function logFaceoff(athleteId, result) {
    if (!gameId) return;
    setLogging(true);
    try {
      await apiClient.post(`/game-live/${gameId}/event`, {
        eventType: result === 'win' ? 'FACEOFF_WIN' : 'FACEOFF_LOSS',
        athleteId,
        metadata:  { period },
      });
      toast.success(`Faceoff ${result}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to log faceoff');
    } finally {
      setLogging(false);
      setPickingResult(null);
    }
  }

  return (
    <div style={{
      padding: 'var(--sp-4)',
      background: 'var(--color-surface-1)',
      border: '1px solid var(--color-surface-2)',
      borderRadius: 'var(--radius-md)',
    }}>
      <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-3)' }}>
        Faceoff
      </p>

      {!pickingResult ? (
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <button
            onClick={() => setPickingResult('win')}
            style={{
              flex: 1, padding: 'var(--sp-3)', borderRadius: 'var(--radius-md)',
              background: 'var(--color-green-bg)', border: '1px solid var(--color-green-border)',
              color: 'var(--color-green)', fontFamily: 'var(--font-body)', fontWeight: 700,
              fontSize: 'var(--text-sm)', cursor: 'pointer', minHeight: 44,
            }}
          >
            Win
          </button>
          <button
            onClick={() => setPickingResult('loss')}
            style={{
              flex: 1, padding: 'var(--sp-3)', borderRadius: 'var(--radius-md)',
              background: 'var(--color-red-bg)', border: '1px solid var(--color-red-border)',
              color: 'var(--color-red)', fontFamily: 'var(--font-body)', fontWeight: 700,
              fontSize: 'var(--text-sm)', cursor: 'pointer', minHeight: 44,
            }}
          >
            Loss
          </button>
        </div>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-3)' }}>
            Who took the faceoff? ({pickingResult === 'win' ? 'Win' : 'Loss'})
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
            {options.slice(0, 8).map(a => (
              <button
                key={a.id}
                onClick={() => logFaceoff(a.id, pickingResult)}
                disabled={logging}
                style={{
                  padding: 'var(--sp-2) var(--sp-3)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-surface-3)',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
                  cursor: 'pointer', minHeight: 36,
                  opacity: logging ? 0.5 : 1,
                }}
              >
                #{a.jersey_number} {a.last_name}
              </button>
            ))}
            <button
              onClick={() => setPickingResult(null)}
              style={{
                padding: 'var(--sp-2) var(--sp-3)',
                borderRadius: 'var(--radius-md)',
                background: 'none',
                border: '1px solid var(--color-surface-2)',
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
                cursor: 'pointer', minHeight: 36,
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main GameMode component ──────────────────────────────────────────────────

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

  const { lines }   = useLines(team?.id);
  const { athletes } = useRoster(team?.id);

  const [homeScore,    setHomeScore]    = useState(0);
  const [awayScore,    setAwayScore]    = useState(0);
  const [period,       setPeriod]       = useState(1);
  const [clockRunning, setClockRunning] = useState(false);
  const [showStats,    setShowStats]    = useState(false);
  const [aiOpen,       setAiOpen]       = useState(false);

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

  if (game?.status === 'scheduled') {
    return (
      <GameSetup
        game={game}
        onGameStarted={() => refreshGame()}
      />
    );
  }

  const is6s      = game?.format === '6s';
  const leading   = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'tied';
  const displayClock = clockTime !== null ? formatClock(clockTime) : '——:——';
  const shotClockSeconds = game?.shot_clock_seconds || DEFAULT_SHOT_CLOCK;

  // Context string for the AI panel
  const aiContext = game
    ? `vs ${game.opponent} · Q${period} · ${homeScore}–${awayScore}`
    : undefined;

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

      {/* ── Shot clock (6s only) ─────────────────────────── */}
      {is6s && (
        <div style={{ marginBottom: 'var(--sp-6)' }}>
          <ShotClock initialSeconds={shotClockSeconds} />
        </div>
      )}

      {/* ── Quick Actions ────────────────────────────────── */}
      <p className="section-heading">Quick Actions</p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--sp-3)',
        marginBottom: 'var(--sp-6)',
      }}>
        <Button
          variant="secondary"
          style={{ width: '100%', justifyContent: 'center', minHeight: 52 }}
          onClick={() => setShowStats(true)}
        >
          Log Stat
        </Button>

        {/* Faceoff only makes sense in standard format */}
        {!is6s && (
          <Button
            variant="outline"
            style={{ width: '100%', justifyContent: 'center', minHeight: 52 }}
            onClick={() => document.getElementById('faceoff-section')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Faceoff
          </Button>
        )}

        <Button
          variant="primary"
          style={{ width: '100%', justifyContent: 'center', minHeight: 52, gridColumn: is6s ? 'span 2' : 'auto' }}
          onClick={() => setAiOpen(true)}
        >
          Ask AI
        </Button>
      </div>

      {/* ── Faceoff tracker (standard only) ─────────────── */}
      {!is6s && athletes && athletes.length > 0 && (
        <div id="faceoff-section" style={{ marginBottom: 'var(--sp-6)' }}>
          <p className="section-heading">Faceoff</p>
          <FaceoffTracker
            gameId={gameId}
            athletes={athletes}
            period={period}
          />
        </div>
      )}

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

      {/* ── Stat logging sheet ───────────────────────────── */}
      {showStats && (
        <StatLogger
          gameId={gameId}
          athletes={athletes || []}
          period={period}
          clockSeconds={clockTime}
          onClose={() => setShowStats(false)}
        />
      )}

      {/* ── AI Coach panel ───────────────────────────────── */}
      <AICoachPanel
        gameId={gameId}
        context={aiContext}
        forceOpen={aiOpen}
        onClose={() => setAiOpen(false)}
      />

    </div>
  );
}
