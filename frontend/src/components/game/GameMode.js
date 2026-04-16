import React, { useState, useEffect } from 'react';
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
import PlaytimePanel from './PlaytimePanel';
import OpponentStatsPanel from './OpponentStatsPanel';
import OpponentThreatsPanel from './OpponentThreatsPanel';
import GameClocksPanel from './GameClocksPanel';
import AICoachPanel from '../ai/AICoachPanel';
import { formatDateTime } from '../../utils/formatters';

const PERIODS = ['1st', '2nd', '3rd', '4th', 'OT'];

// Default shot clock for 6s format (seconds); overridden by game.shot_clock_seconds.
// 45s matches the common CIF/club sixes cadence; rules JSON supports 45/60/75.
const DEFAULT_SHOT_CLOCK = 45;

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
  const [gameTime, setGameTime] = useState('');

  const upcoming = games.filter(g => g.status !== 'completed');

  async function handleCreate(e) {
    e.preventDefault();
    if (!opponent.trim()) return;
    setCreating(true);
    try {
      const game = await scheduleGame({ opponent: opponent.trim(), gameDate, startTime: gameTime || undefined, format });
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 130px', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
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
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-1)' }}>
                Time <span style={{ fontWeight: 300, textTransform: 'none', letterSpacing: 0 }}>(opt.)</span>
              </label>
              <input
                type="time"
                value={gameTime}
                onChange={e => setGameTime(e.target.value)}
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
                  {formatDateTime(g.game_date, g.start_time, { weekday: 'short', month: 'short', day: 'numeric' })}
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

// ─── Stat logging sheet ───────────────────────────────────────────────────────

const STAT_EVENTS = [
  { type: 'goal',            label: 'Goal',        color: 'var(--color-gold)' },
  { type: 'assist',          label: 'Assist',      color: 'var(--color-gold)' },
  { type: 'shot',            label: 'Shot',        color: 'var(--color-blue)' },
  { type: 'ground_ball',     label: 'Ground Ball', color: 'var(--color-green)' },
  { type: 'turnover',        label: 'Turnover',    color: 'var(--color-red)' },
  { type: 'caused_turnover', label: 'Caused TO',   color: 'var(--color-green)' },
  { type: 'save',            label: 'Save',        color: 'var(--color-blue)' },
];

const PENALTY_TYPES = [
  { type: 'personal_foul',       label: 'Personal Foul',         seconds: 30 },
  { type: 'technical_foul',      label: 'Technical Foul',        seconds: 30 },
  { type: 'unnecessary_rough',   label: 'Unnecessary Roughness', seconds: 60 },
  { type: 'illegal_body_check',  label: 'Illegal Body Check',    seconds: 60 },
  { type: 'slashing',            label: 'Slashing',              seconds: 60 },
  { type: 'tripping',            label: 'Tripping',              seconds: 30 },
  { type: 'pushing',             label: 'Pushing',               seconds: 30 },
  { type: 'holding',             label: 'Holding',               seconds: 30 },
  { type: 'interference',        label: 'Interference',          seconds: 30 },
  { type: 'illegal_crosse',      label: 'Illegal Crosse',        seconds: 30 },
  { type: 'unsportsmanlike',     label: 'Unsportsmanlike',       seconds: 60, nonReleasable: true },
  { type: 'expulsion',           label: 'Expulsion',             seconds: 180, nonReleasable: true },
];

function fmtPenaltyDuration(seconds) {
  return seconds >= 60 ? `${seconds / 60} min` : `${seconds}s`;
}

// step: 'player' → 'event' → 'penalty_type' → 'penalty_confirm'
function StatLogger({ gameId, athletes, period, clockSeconds, onClose }) {
  const toast = useToast();
  const [step,          setStep]          = useState('player');
  const [selected,      setSelected]      = useState(null); // athleteId
  const [penaltyType,   setPenaltyType]   = useState(null); // PENALTY_TYPES entry
  const [penaltySeconds, setPenaltySeconds] = useState(0);
  const [logging,       setLogging]       = useState(false);

  const fieldPlayers = athletes || [];

  function resetToPlayer() {
    setStep('player');
    setSelected(null);
    setPenaltyType(null);
    setPenaltySeconds(0);
  }

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
      resetToPlayer();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to log stat');
    } finally {
      setLogging(false);
    }
  }

  async function logPenalty() {
    if (!selected || !penaltyType || !gameId) return;
    setLogging(true);
    try {
      await apiClient.post(`/game-live/${gameId}/event`, {
        eventType: 'PENALTY',
        athleteId: selected,
        metadata:  { period, clockSeconds, penaltyType: penaltyType.type, penaltySeconds, nonReleasable: penaltyType.nonReleasable || false },
      });
      toast.success(`Penalty: ${penaltyType.label} (${fmtPenaltyDuration(penaltySeconds)}) logged`);
      resetToPlayer();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to log penalty');
    } finally {
      setLogging(false);
    }
  }

  const headings = {
    player:          'Tap a player',
    event:           'Tap the event to log',
    penalty_type:    'Select penalty type',
    penalty_confirm: 'Confirm penalty',
  };

  const selectedAthlete = fieldPlayers.find(p => p.id === selected);

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
        maxHeight: '75dvh',
        overflowY: 'auto',
      }}>
        {/* Handle + close */}
        <div style={{ position: 'relative', marginBottom: 'var(--sp-5)' }}>
          <div style={{ width: 40, height: 4, background: 'var(--color-surface-3)', borderRadius: 2, margin: '0 auto' }} />
          <button
            onClick={onClose}
            style={{ position: 'absolute', right: 0, top: -10, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="section-heading" style={{ marginBottom: 'var(--sp-4)' }}>
          {headings[step]}
        </p>

        {/* ── Step: player ── */}
        {step === 'player' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
            gap: 'var(--sp-2)',
            marginBottom: 'var(--sp-5)',
          }}>
            {fieldPlayers.map(a => (
              <button
                key={a.id}
                onClick={() => { setSelected(a.id); setStep('event'); }}
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

        {/* Selected player bar — shown on event / penalty steps */}
        {step !== 'player' && selectedAthlete && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
            marginBottom: 'var(--sp-4)',
            padding: 'var(--sp-3)',
            background: 'var(--color-gold-muted)',
            border: '1px solid var(--color-gold-border)',
            borderRadius: 'var(--radius-md)',
          }}>
            <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-lg)', color: 'var(--color-gold)' }}>
              {selectedAthlete.jersey_number}
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
              {selectedAthlete.first_name} {selectedAthlete.last_name}
            </span>
            <button
              onClick={resetToPlayer}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 18 }}
            >
              ×
            </button>
          </div>
        )}

        {/* ── Step: event ── */}
        {step === 'event' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 'var(--sp-3)' }}>
            {STAT_EVENTS.map(ev => (
              <button
                key={ev.type}
                onClick={() => logStat(ev.type)}
                disabled={logging}
                style={{
                  padding: 'var(--sp-4)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-1)',
                  border: '1px solid var(--color-surface-2)',
                  cursor: logging ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)',
                  color: ev.color, textAlign: 'center', minHeight: 52,
                  transition: 'all var(--ease-fast)', opacity: logging ? 0.5 : 1,
                }}
                onPointerDown={e => { if (!logging) e.currentTarget.style.transform = 'scale(0.95)'; }}
                onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
                onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {ev.label}
              </button>
            ))}
            {/* Penalty entry point */}
            <button
              onClick={() => setStep('penalty_type')}
              disabled={logging}
              style={{
                padding: 'var(--sp-4)',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.3)',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)',
                color: 'var(--color-red)', textAlign: 'center', minHeight: 52,
                transition: 'all var(--ease-fast)', opacity: logging ? 0.5 : 1,
              }}
              onPointerDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
              onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              Penalty
            </button>
          </div>
        )}

        {/* ── Step: penalty_type ── */}
        {step === 'penalty_type' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {PENALTY_TYPES.map(pt => (
              <button
                key={pt.type}
                onClick={() => { setPenaltyType(pt); setPenaltySeconds(pt.seconds); setStep('penalty_confirm'); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 'var(--sp-3) var(--sp-4)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-1)',
                  border: '1px solid var(--color-surface-2)',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all var(--ease-fast)',
                }}
                onPointerDown={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
                onPointerUp={e => e.currentTarget.style.background = 'var(--color-surface-1)'}
                onPointerLeave={e => e.currentTarget.style.background = 'var(--color-surface-1)'}
              >
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                  {pt.label}{pt.nonReleasable ? <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-red)' }}>NR</span> : null}
                </span>
                <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', flexShrink: 0, marginLeft: 'var(--sp-3)' }}>
                  {fmtPenaltyDuration(pt.seconds)}
                </span>
              </button>
            ))}
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 10, color: 'var(--color-text-subtle)', textAlign: 'right', marginTop: 'var(--sp-1)' }}>
              NR = Non-releasable
            </p>
          </div>
        )}

        {/* ── Step: penalty_confirm ── */}
        {step === 'penalty_confirm' && penaltyType && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <div style={{
              padding: 'var(--sp-4)',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 'var(--radius-md)',
            }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', marginBottom: 'var(--sp-3)' }}>
                {penaltyType.label}
                {penaltyType.nonReleasable && (
                  <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--color-red)', fontSize: 10, fontWeight: 700 }}>
                    Non-releasable
                  </span>
                )}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                  Duration
                </span>
                <button
                  onClick={() => setPenaltySeconds(s => Math.max(30, s - 30))}
                  style={{ padding: '4px 10px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-primary)', fontWeight: 700 }}
                >
                  −
                </button>
                <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-lg)', color: 'var(--color-red)', minWidth: 56, textAlign: 'center' }}>
                  {fmtPenaltyDuration(penaltySeconds)}
                </span>
                <button
                  onClick={() => setPenaltySeconds(s => s + 30)}
                  style={{ padding: '4px 10px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-primary)', fontWeight: 700 }}
                >
                  +
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <Button variant="ghost" size="sm" onClick={() => setStep('penalty_type')} style={{ flex: 1 }}>
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={logPenalty}
                disabled={logging}
                style={{ flex: 2, background: 'var(--color-red)', borderColor: 'var(--color-red)' }}
              >
                {logging ? 'Logging…' : 'Log Penalty'}
              </Button>
            </div>
          </div>
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
  const toast      = useToast();
  const token      = localStorage.getItem('token');

  const { game, loading, updateScore, updateStatus, refresh: refreshGame } = useGame(gameId);
  const {
    connected, liveState, clockTime, mergeAlerts, activating,
    playtime, equityFlags, threats,
    startClock, stopClock, logOpponentEvent,
    addToQueue, removeFromQueue, removeMoveFromQueue, activateQueue,
  } = useGameSocket(gameId, token);

  const { lines, createLine } = useLines(team?.id);
  const { athletes } = useRoster(team?.id);

  const [homeScore,      setHomeScore]      = useState(0);
  const [awayScore,      setAwayScore]      = useState(0);
  const [period,         setPeriod]         = useState(1);
  const [clockRunning,   setClockRunning]   = useState(false);
  const [showStats,      setShowStats]      = useState(false);
  const [aiOpen,         setAiOpen]         = useState(false);
  const [undoing,        setUndoing]        = useState(false);

  // HIGH-urgency under-target flags from the socket feed. Equity flags arrive
  // every ~5s via playtime_tick; we only surface the urgent under-target
  // alerts here as a sub-in nudge on top of the dedicated PlaytimePanel.
  const playtimeAlerts = (equityFlags || []).filter(
    f => f.urgency === 'HIGH' && f.status === 'UNDER_TARGET'
  );

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

  // Auto-generate default lines grouped by position when none exist
  async function autoGenerateLines() {
    if (!athletes || athletes.length === 0) return;

    function avgSkill(a) {
      const vals = [
        a.skill_shooting, a.skill_passing, a.skill_dodging, a.skill_field_awareness,
        a.skill_defense, a.skill_ground_balls, a.skill_transition,
      ].filter(v => v != null);
      return vals.length ? vals.reduce((s, v) => s + Number(v), 0) / vals.length : 0;
    }

    const active = athletes.filter(a => a.status !== 'injured');

    const groups = {
      attack:   active.filter(a => a.primary_position === 'Attack').sort((a, b) => avgSkill(b) - avgSkill(a)).slice(0, 3),
      midfield: active.filter(a => a.primary_position === 'Midfield' || a.primary_position === 'FOGO').sort((a, b) => avgSkill(b) - avgSkill(a)).slice(0, 3),
      defense:  active.filter(a => a.primary_position === 'Defense' || a.primary_position === 'Goalie').sort((a, b) => avgSkill(b) - avgSkill(a)).slice(0, 4),
    };

    await Promise.all(
      Object.entries(groups)
        .filter(([, players]) => players.length > 0)
        .map(([group, players]) =>
          createLine({
            name: `Auto ${group.charAt(0).toUpperCase() + group.slice(1)}`,
            positionGroup: group,
            playerIds: players.map(p => p.id),
          }).catch(() => null) // don't fail the whole batch if one group errors
        )
    );
  }

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

  async function undoLastEvent() {
    if (!gameId || undoing) return;
    setUndoing(true);
    try {
      const res = await apiClient.delete(`/game-live/${gameId}/event/last`);
      if (res.data.removed) {
        toast.success('Last stat event undone');
      } else {
        toast.info('Nothing to undo');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Undo failed');
    } finally {
      setUndoing(false);
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
          <Badge variant={connected ? 'green' : 'red'} dot>{connected ? 'Live' : 'Offline'}</Badge>
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

      {/* ── Secondary clocks (clear / stall / shot / timeout) ── */}
      <GameClocksPanel
        format={game?.format || 'standard'}
        shotClockSeconds={shotClockSeconds}
      />

      {/* ── Playtime Alerts ──────────────────────────────── */}
      {playtimeAlerts.length > 0 && (
        <div style={{ marginBottom: 'var(--sp-6)' }}>
          {playtimeAlerts.map(flag => {
            const a = athletes?.find(p => String(p.id) === String(flag.athleteId));
            const name = a ? `#${a.jersey_number ?? ''} ${a.first_name} ${a.last_name}`.trim() : `Player ${flag.athleteId}`;
            return (
              <div
                key={flag.athleteId}
                style={{
                  background: 'var(--color-amber-muted, rgba(180,100,0,0.15))',
                  border: '1px solid var(--color-amber-border, rgba(180,100,0,0.3))',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  marginBottom: 'var(--sp-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 'var(--sp-3)',
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)',
                  color: 'var(--color-gold)',
                }}>
                  {name} needs {flag.minutesUnder}m — {flag.totalMinutes}/{flag.targetMinutes} min played
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
                  letterSpacing: '1px', textTransform: 'uppercase',
                  color: 'var(--color-gold)', opacity: 0.7,
                }}>
                  Sub in
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Live Playtime Panel ─────────────────────────── */}
      <PlaytimePanel
        athletes={athletes || []}
        playtime={playtime}
        equityFlags={equityFlags}
      />

      {/* ── Opponent Stats Logger ────────────────────────── */}
      <OpponentStatsPanel
        gameId={gameId}
        opposingTeamId={game?.opposing_team_id || null}
        opponentName={game?.opponent || 'Opponent'}
        logOpponentEvent={logOpponentEvent}
      />

      {/* ── Opponent Threats (P6) ────────────────────────── */}
      <OpponentThreatsPanel
        gameId={gameId}
        opposingTeamId={game?.opposing_team_id || null}
        threats={threats}
      />

      {/* ── Quick Actions ────────────────────────────────── */}
      <p className="section-heading">Quick Actions</p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: is6s ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)',
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
          variant="ghost"
          style={{ width: '100%', justifyContent: 'center', minHeight: 52, opacity: undoing ? 0.5 : 1 }}
          onClick={undoLastEvent}
          disabled={undoing}
        >
          {undoing ? 'Undoing…' : 'Undo Stat'}
        </Button>

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
          onAutoGenerateLines={autoGenerateLines}
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
