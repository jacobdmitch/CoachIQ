import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRoster } from '../../hooks/useRoster';
import Badge from '../common/Badge';
import Button from '../common/Button';

const POS_VARIANT = { Attack: 'red', Midfield: 'gold', Defense: 'blue', Goalie: 'green', FOGO: 'amber' };
const FILTERS = ['All', 'Attack', 'Midfield', 'Defense', 'Goalie', 'FOGO'];

export default function RosterList() {
  const { team }  = useAuth();
  const { athletes, loading, error, refresh } = useRoster(team?.id);
  const [filter, setFilter] = useState('All');

  const filtered = filter === 'All' ? athletes : athletes.filter(a => a.primary_position === filter);

  if (!team) {
    return (
      <div className="page-content">
        <div className="page-header">
          <h1 className="page-title">Roster <span>Management</span></h1>
        </div>
        <p style={{ color: 'var(--color-text-muted)' }}>No team selected.</p>
      </div>
    );
  }

  return (
    <div className="page-content">

      <div className="page-header">
        <div>
          <h1 className="page-title">Roster <span>Management</span></h1>
          <p className="page-subtitle">
            {loading ? 'Loading…' : `${athletes.length} athletes — ${team.teamName}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <Button variant="ghost" size="sm" onClick={refresh}>Refresh</Button>
          <Button variant="outline" size="sm">+ Add Athlete</Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'var(--color-red-bg)', border: '1px solid var(--color-red-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-6)', color: 'var(--color-red)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}>
          {error}
        </div>
      )}

      {/* Position filter */}
      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-6)', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px var(--sp-4)', borderRadius: 'var(--radius-full)', border: '1px solid',
            borderColor: filter === f ? 'var(--color-gold)' : 'var(--color-surface-3)',
            background: filter === f ? 'var(--color-gold-muted)' : 'transparent',
            color: filter === f ? 'var(--color-gold)' : 'var(--color-text-muted)',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
            letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer',
            minHeight: '36px', transition: 'all var(--ease-base)',
          }}>
            {f} {f !== 'All' && `(${athletes.filter(a => a.primary_position === f).length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Column headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 100px 52px 40px 40px 40px',
          gap: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-6)',
          borderBottom: '1px solid var(--color-surface-3)',
          background: 'var(--color-surface-1)',
        }}>
          {['#', 'Athlete', 'Position', 'Year', 'GP', 'G', 'A'].map(col => (
            <span key={col} className="label" style={{ fontSize: '10px' }}>{col}</span>
          ))}
        </div>

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <p style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--color-text-subtle)', fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)' }}>
            {filter !== 'All' ? `No ${filter} players on roster.` : 'No athletes yet. Add your first player.'}
          </p>
        )}

        {/* Rows */}
        {filtered.map((p, i) => (
          <Link key={p.id} to={`/roster/${p.id}`} style={{
            display: 'grid',
            gridTemplateColumns: '44px 1fr 100px 52px 40px 40px 40px',
            gap: 'var(--sp-4)', padding: 'var(--sp-4) var(--sp-6)',
            borderBottom: i < filtered.length - 1 ? '1px solid var(--color-surface-2)' : 'none',
            alignItems: 'center', textDecoration: 'none', transition: 'background var(--ease-base)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-sm)', color: 'var(--color-gold)' }}>
              {p.jersey_number ?? '—'}
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', letterSpacing: '0.3px' }}>
              {p.first_name} {p.last_name}
              {p.status === 'injured' && (
                <Badge variant="red" style={{ marginLeft: 8 }}>INJ</Badge>
              )}
            </span>
            <Badge variant={POS_VARIANT[p.primary_position] || 'gray'}>
              {p.primary_position || '—'}
            </Badge>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', letterSpacing: 1 }}>
              {p.graduation_year ? `'${String(p.graduation_year).slice(-2)}` : '—'}
            </span>
            {[p.games_played, p.goals, p.assists].map((val, idx) => (
              <span key={idx} style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
                {val ?? '—'}
              </span>
            ))}
          </Link>
        ))}
      </div>

    </div>
  );
}
