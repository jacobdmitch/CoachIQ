import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAthlete } from '../../hooks/useRoster';
import StatCard from '../common/StatCard';
import Badge from '../common/Badge';
import Button from '../common/Button';

const POS_VARIANT = { Attack: 'red', Midfield: 'gold', Defense: 'blue', Goalie: 'green', FOGO: 'amber' };

function SkillBar({ label, value }) {
  if (!value) return null;
  const pct = (value / 10) * 100;
  return (
    <div style={{ marginBottom: 'var(--sp-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
          {label}
        </span>
        <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
          {value}
        </span>
      </div>
      <div style={{ height: 4, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 'var(--radius-full)',
          background: value >= 8 ? 'var(--color-gold)' : value >= 6 ? 'var(--color-blue)' : 'var(--color-surface-4)',
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  );
}

export default function AthleteProfile() {
  const { athleteId } = useParams();
  const { athlete, loading, error } = useAthlete(athleteId);

  if (loading) {
    return (
      <div className="page-content">
        <Link to="/roster" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: 'var(--sp-6)' }}>
          ← Roster
        </Link>
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>Loading…</p>
      </div>
    );
  }

  if (error || !athlete) {
    return (
      <div className="page-content">
        <Link to="/roster" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: 'var(--sp-6)' }}>
          ← Roster
        </Link>
        <p style={{ color: 'var(--color-red)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>{error || 'Athlete not found.'}</p>
      </div>
    );
  }

  const shotPct = athlete.shots > 0 ? Math.round((athlete.goals / athlete.shots) * 100) : 0;

  return (
    <div className="page-content">

      <Link to="/roster" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: 'var(--sp-6)', transition: 'color var(--ease-base)' }}>
        ← Roster
      </Link>

      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 'var(--radius-md)',
            background: 'var(--color-gold-muted)', border: '2px solid var(--color-gold-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-stats)', fontSize: 'var(--text-2xl)', color: 'var(--color-gold)', flexShrink: 0,
          }}>
            {athlete.jersey_number ?? '—'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-2)', flexWrap: 'wrap' }}>
              <h1 className="page-title">{athlete.first_name} {athlete.last_name}</h1>
              {athlete.primary_position && (
                <Badge variant={POS_VARIANT[athlete.primary_position] || 'gray'}>
                  {athlete.primary_position}
                </Badge>
              )}
              {athlete.status === 'injured' && <Badge variant="red" dot>Injured</Badge>}
            </div>
            <p className="page-subtitle">
              {athlete.graduation_year ? `Class of ${athlete.graduation_year}` : ''}
              {athlete.secondary_position ? ` · Also plays ${athlete.secondary_position}` : ''}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm">Edit Profile</Button>
      </div>

      {/* Season stats */}
      <p className="section-heading">Season Stats</p>
      <div className="grid-4" style={{ marginBottom: 'var(--sp-8)' }}>
        <StatCard label="Goals"       value={athlete.goals        ?? 0} />
        <StatCard label="Assists"     value={athlete.assists      ?? 0} />
        <StatCard label="Points"      value={(athlete.goals ?? 0) + (athlete.assists ?? 0)} />
        <StatCard label="Shot %"      value={shotPct} unit="%" />
      </div>
      <div className="grid-4" style={{ marginBottom: 'var(--sp-8)' }}>
        <StatCard label="Games Played"  value={athlete.games_played  ?? 0} />
        <StatCard label="Shots"         value={athlete.shots         ?? 0} />
        <StatCard label="Ground Balls"  value={athlete.ground_balls  ?? 0} />
        <StatCard label="Status"        value={athlete.status ? athlete.status.charAt(0).toUpperCase() + athlete.status.slice(1) : 'Active'} />
      </div>

      {/* Skill ratings */}
      {(athlete.skill_shooting || athlete.skill_passing || athlete.skill_defense) && (
        <>
          <p className="section-heading">Skill Ratings</p>
          <div className="grid-2" style={{ marginBottom: 'var(--sp-8)' }}>
            <div className="card">
              <SkillBar label="Shooting"       value={athlete.skill_shooting} />
              <SkillBar label="Passing"        value={athlete.skill_passing} />
              <SkillBar label="Dodging"        value={athlete.skill_dodging} />
              <SkillBar label="Field Awareness" value={athlete.skill_field_awareness} />
            </div>
            <div className="card">
              <SkillBar label="Defense"        value={athlete.skill_defense} />
              <SkillBar label="Ground Balls"   value={athlete.skill_ground_balls} />
              <SkillBar label="Faceoff"        value={athlete.skill_faceoff} />
              <SkillBar label="Transition"     value={athlete.skill_transition} />
            </div>
          </div>
        </>
      )}

      {/* Notes */}
      {athlete.notes && (
        <>
          <p className="section-heading">Coach Notes</p>
          <div className="card">
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)' }}>
              {athlete.notes}
            </p>
          </div>
        </>
      )}

    </div>
  );
}
