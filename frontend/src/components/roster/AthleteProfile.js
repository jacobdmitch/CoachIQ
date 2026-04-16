import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAthlete } from '../../hooks/useRoster';
import { useRoster } from '../../hooks/useRoster';
import { useAuth } from '../../context/AuthContext';
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
  const { team } = useAuth();
  const { updateAthlete } = useRoster(team?.id);

  const [editing,     setEditing]     = useState(false);
  const [editEmail,   setEditEmail]   = useState('');
  const [editSummary, setEditSummary] = useState(false);
  const [saving,      setSaving]      = useState(false);

  function openEdit() {
    setEditEmail(athlete?.email || '');
    setEditSummary(athlete?.send_game_summary || false);
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await updateAthlete(athleteId, { email: editEmail.trim() || null, sendGameSummary: editSummary });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

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

  const shotPct = athlete.shots > 0 ? Math.min(100, Math.round((Number(athlete.goals) / Number(athlete.shots)) * 100)) : 0;

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
        <Button variant="ghost" size="sm" onClick={openEdit}>Edit Profile</Button>
      </div>

      {/* Contact / notifications — only shown when data exists */}
      {(athlete.email || athlete.send_game_summary) && (
        <>
          <p className="section-heading">Contact</p>
          <div className="card" style={{ marginBottom: 'var(--sp-8)', display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
            {athlete.email && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                <span style={{ fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', fontSize: 'var(--text-xs)', letterSpacing: '1px', marginRight: 8 }}>Email</span>
                {athlete.email}
              </span>
            )}
            {athlete.send_game_summary && (
              <Badge variant="gold">Post-game summaries on</Badge>
            )}
          </div>
        </>
      )}

      {/* Season stats */}
      <p className="section-heading">Season Stats</p>
      <div className="grid-4" style={{ marginBottom: 'var(--sp-8)' }}>
        <StatCard label="Goals"       value={athlete.goals        ?? 0} />
        <StatCard label="Assists"     value={athlete.assists      ?? 0} />
        <StatCard label="Points"      value={Number(athlete.goals ?? 0) + Number(athlete.assists ?? 0)} />
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
              <SkillBar label="Shooting"        value={athlete.skill_shooting} />
              <SkillBar label="Passing"         value={athlete.skill_passing} />
              <SkillBar label="Dodging"         value={athlete.skill_dodging} />
              <SkillBar label="Field Awareness" value={athlete.skill_field_awareness} />
            </div>
            <div className="card">
              <SkillBar label="Defense"      value={athlete.skill_defense} />
              <SkillBar label="Ground Balls" value={athlete.skill_ground_balls} />
              <SkillBar label="Faceoff"      value={athlete.skill_faceoff} />
              <SkillBar label="Transition"   value={athlete.skill_transition} />
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

      {/* Edit modal */}
      {editing && (
        <div
          onClick={() => setEditing(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 'var(--sp-4)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)', padding: 'var(--sp-6)',
              width: '100%', maxWidth: 420,
            }}
          >
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-5)' }}>
              Edit Profile — {athlete.first_name} {athlete.last_name}
            </p>

            {/* Email */}
            <label style={{ display: 'block', marginBottom: 'var(--sp-4)' }}>
              <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-2)' }}>
                Email (optional)
              </span>
              <input
                type="email"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="player@example.com"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            </label>

            {/* Post-game summary toggle */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)', cursor: 'pointer', marginBottom: 'var(--sp-6)' }}>
              <input
                type="checkbox"
                checked={editSummary}
                onChange={e => setEditSummary(e.target.checked)}
                style={{ marginTop: 2, accentColor: 'var(--color-gold)', width: 16, height: 16, flexShrink: 0 }}
              />
              <span>
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                  Send post-game summary
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  Email this player their stats after each game
                </span>
              </span>
            </label>

            <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
