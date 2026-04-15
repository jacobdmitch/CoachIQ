import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../hooks/useDashboard';
import { useGames } from '../../hooks/useGame';
import StatCard from '../common/StatCard';
import Badge from '../common/Badge';
import Button from '../common/Button';

/* ─── Schedule game modal ───────────────────────────────────────────────────── */

function ScheduleModal({ teamId, onClose, onSaved }) {
  const { scheduleGame } = useGames(teamId);
  const [opponent, setOpponent] = useState('');
  const [gameDate, setGameDate] = useState(new Date().toISOString().split('T')[0]);
  const [format,   setFormat]   = useState('standard');
  const [saving,   setSaving]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!opponent.trim()) return;
    setSaving(true);
    try {
      await scheduleGame({ opponent: opponent.trim(), gameDate, format });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--color-surface-2)', border: '1px solid var(--color-surface-3)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)',
    padding: '10px var(--sp-4)', outline: 'none',
  };

  const labelStyle = {
    display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700,
    fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase',
    color: 'var(--color-text-muted)', marginBottom: 'var(--sp-1)',
  };

  const segBtn = (val) => ({
    flex: 1, padding: '10px var(--sp-3)',
    border: '1px solid',
    borderColor: format === val ? 'var(--color-gold)' : 'var(--color-surface-3)',
    background:  format === val ? 'var(--color-gold-muted)' : 'transparent',
    color:       format === val ? 'var(--color-gold)' : 'var(--color-text-muted)',
    fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
    letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer',
    transition: 'all var(--ease-base)',
  });

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(440px, 92vw)',
        background: 'var(--color-surface-0)', border: '1px solid var(--color-surface-3)',
        borderRadius: 'var(--radius-lg)', padding: 'var(--sp-8)',
        zIndex: 201, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-6)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--color-text-primary)', margin: 0 }}>
            Schedule Game
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '1.2rem', cursor: 'pointer', padding: 4 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Opponent</label>
              <input style={inputStyle} value={opponent} onChange={e => setOpponent(e.target.value)} placeholder="Opponent name" required />
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input style={inputStyle} type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Format</label>
              <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', height: 41 }}>
                <button type="button" onClick={() => setFormat('standard')} style={{ ...segBtn('standard'), borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)' }}>10v10</button>
                <button type="button" onClick={() => setFormat('6s')}      style={{ ...segBtn('6s'), borderLeft: 'none', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}>6s</button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end', marginTop: 'var(--sp-2)' }}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving || !opponent.trim()}>
              {saving ? 'Saving…' : 'Schedule'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SeasonDashboard() {
  const { team, coach } = useAuth();
  const { data, loading, error, refresh } = useDashboard(team?.id);
  const [showSchedule, setShowSchedule] = useState(false);

  // ─── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Season <span>Overview</span></h1>
          </div>
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>
          Loading…
        </p>
      </div>
    );
  }

  // ─── No team configured ───────────────────────────────────
  if (!team) {
    return (
      <div className="page-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Season <span>Overview</span></h1>
            <p className="page-subtitle">Welcome, {coach?.firstName}</p>
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 'var(--sp-12)' }}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--sp-4)' }}>
            No team configured yet. Create your first team to get started.
          </p>
          <Button variant="primary">Create Team</Button>
        </div>
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────
  if (error) {
    return (
      <div className="page-content">
        <div className="page-header">
          <h1 className="page-title">Season <span>Overview</span></h1>
        </div>
        <div className="card" style={{ borderColor: 'var(--color-red-border)', background: 'var(--color-red-bg)' }}>
          <p style={{ color: 'var(--color-red)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>{error}</p>
          <Button variant="ghost" size="sm" onClick={refresh} style={{ marginTop: 'var(--sp-3)' }}>Retry</Button>
        </div>
      </div>
    );
  }

  const {
    record,
    stats,
    roster,
    recentGames     = [],
    topScorers      = [],
    playtimeEquity  = [],
    playtimeFlags   = [],
    avgMinutes      = 0,
  } = data || {};
  const wins     = parseInt(record?.wins   || 0);
  const losses   = parseInt(record?.losses || 0);
  const total    = wins + losses;
  const winPct   = total > 0 ? Math.round((wins / total) * 100) : 0;

  return (
    <div className="page-content">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{team.teamName} <span>Overview</span></h1>
          <p className="page-subtitle">{team.season} Season</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <Button variant="ghost" size="sm" onClick={refresh}>Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => setShowSchedule(true)}>+ Schedule Game</Button>
        </div>
      </div>

      {/* Record */}
      <p className="section-heading">Season Record</p>
      <div className="grid-4" style={{ marginBottom: 'var(--sp-8)' }}>
        <StatCard label="Wins"      value={wins} />
        <StatCard label="Losses"    value={losses} />
        <StatCard label="Win Rate"  value={winPct} unit="%" />
        <StatCard label="Upcoming"  value={parseInt(record?.upcoming || 0)} sub="Scheduled games" />
      </div>

      {/* Team stats */}
      {stats && (
        <>
          <p className="section-heading">Team Averages</p>
          <div className="grid-4" style={{ marginBottom: 'var(--sp-8)' }}>
            <StatCard label="Goals / Game"   value={stats.avgGoalsFor    ?? '—'} />
            <StatCard label="Allowed / Game" value={stats.avgGoalsAgainst ?? '—'} />
            <StatCard label="Roster (Active)" value={parseInt(roster?.active || 0)} />
            <StatCard label="Injured"         value={parseInt(roster?.injured || 0)}
              sub={`${roster?.total || 0} total athletes`} />
          </div>
        </>
      )}

      <div className="grid-2" style={{ marginBottom: 'var(--sp-8)' }}>

        {/* Recent games */}
        <div>
          <p className="section-heading">Recent Games</p>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {recentGames.length === 0 ? (
              <p style={{ padding: 'var(--sp-6)', color: 'var(--color-text-subtle)', fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)' }}>
                No completed games yet.
              </p>
            ) : recentGames.map((game, i) => (
              <div key={game.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-4)',
                padding: 'var(--sp-4) var(--sp-5)',
                borderBottom: i < recentGames.length - 1 ? '1px solid var(--color-surface-2)' : 'none',
              }}>
                <Badge variant={game.result === 'W' ? 'green' : game.result === 'L' ? 'red' : 'amber'} dot>
                  {game.result || '—'}
                </Badge>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                    vs {game.opponent}
                  </p>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {formatDate(game.game_date)}
                  </p>
                </div>
                <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-lg)', color: 'var(--color-text-secondary)', letterSpacing: 1 }}>
                  {game.score_home}–{game.score_away}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top scorers */}
        <div>
          <p className="section-heading">Top Scorers</p>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {topScorers.length === 0 ? (
              <p style={{ padding: 'var(--sp-6)', color: 'var(--color-text-subtle)', fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)' }}>
                No stats recorded yet.
              </p>
            ) : topScorers.map((p, i) => (
              <Link key={p.id} to={`/roster/${p.id}`} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-4)',
                padding: 'var(--sp-4) var(--sp-5)',
                borderBottom: i < topScorers.length - 1 ? '1px solid var(--color-surface-2)' : 'none',
                textDecoration: 'none',
                transition: 'background var(--ease-base)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-sm)', color: 'var(--color-gold)', minWidth: 24 }}>
                  {p.jersey_number}
                </span>
                <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                  {p.first_name} {p.last_name}
                </span>
                <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
                  {p.goals}G {p.assists}A
                </span>
              </Link>
            ))}
          </div>
        </div>

      </div>

      {/* Playtime equity */}
      {playtimeEquity.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
            <p className="section-heading" style={{ margin: 0 }}>Playtime Equity</p>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Team avg {avgMinutes} min
            </span>
          </div>

          {/* Flags */}
          {playtimeFlags.length > 0 && (
            <div style={{ marginBottom: 'var(--sp-4)' }}>
              {playtimeFlags.map(flag => (
                <div key={flag.athleteId} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-3)',
                  padding: 'var(--sp-2) var(--sp-4)',
                  background: 'var(--color-amber-bg, rgba(245,158,11,0.08))',
                  border: '1px solid var(--color-amber-border, rgba(245,158,11,0.25))',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 'var(--sp-2)',
                }}>
                  <Badge variant="amber" dot>Low PT</Badge>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                    #{flag.jerseyNumber} {flag.name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                    {flag.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Bar chart */}
          <div className="card" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-8)' }}>
            {playtimeEquity.map(athlete => {
              const pct = avgMinutes > 0 ? Math.min((athlete.totalMinutes / (avgMinutes * 2)) * 100, 100) : 0;
              const isFlagged = playtimeFlags.some(f => f.athleteId === athlete.athleteId);
              return (
                <div key={athlete.athleteId} style={{ marginBottom: 'var(--sp-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', color: isFlagged ? 'var(--color-amber, #f59e0b)' : 'var(--color-text-secondary)' }}>
                      #{athlete.jerseyNumber} {athlete.lastName}
                    </span>
                    <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {athlete.totalMinutes}m
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: isFlagged ? 'var(--color-amber, #f59e0b)' : 'var(--color-gold)',
                      borderRadius: 3,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showSchedule && (
        <ScheduleModal
          teamId={team.id}
          onClose={() => setShowSchedule(false)}
          onSaved={() => { setShowSchedule(false); refresh(); }}
        />
      )}

    </div>
  );
}
