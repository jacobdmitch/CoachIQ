import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../hooks/useDashboard';
import StatCard from '../common/StatCard';
import Badge from '../common/Badge';
import Button from '../common/Button';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SeasonDashboard() {
  const { team, coach } = useAuth();
  const { data, loading, error, refresh } = useDashboard(team?.id);

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

  const { record, stats, roster, recentGames = [], topScorers = [] } = data || {};
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
        <Button variant="outline" size="sm" onClick={refresh}>Refresh</Button>
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
    </div>
  );
}
