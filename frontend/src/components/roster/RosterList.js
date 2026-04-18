import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRoster } from '../../hooks/useRoster';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { GRAD_MONTHS } from './gradMonths';

const POS_VARIANT = { Attack: 'red', Midfield: 'gold', Defense: 'blue', Goalie: 'green', FOGO: 'amber' };
const POSITIONS   = ['Attack', 'Midfield', 'Defense', 'Goalie', 'FOGO'];
const FILTERS     = ['All', ...POSITIONS];

const EMPTY_FORM = {
  firstName: '', lastName: '', jerseyNumber: '',
  primaryPosition: '', graduationYear: '', graduationMonth: '',
  shotHand: '', isCaptain: false, depthTier: '',
  email: '', sendGameSummary: false,
};

/* ─── Athlete form modal ────────────────────────────────────────────────────── */

function AthleteModal({ initial, onSave, onClose, saving }) {
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState(
    isEdit
      ? {
          firstName:       initial.first_name       || '',
          lastName:        initial.last_name         || '',
          jerseyNumber:    initial.jersey_number     ?? '',
          primaryPosition: initial.primary_position  || '',
          graduationYear:  initial.graduation_year   ?? '',
          graduationMonth: initial.graduation_month  ?? '',
          shotHand:        initial.shot_hand         || '',
          isCaptain:       initial.is_captain        || false,
          depthTier:       initial.depth_tier        || '',
          email:           initial.email             || '',
          sendGameSummary: initial.send_game_summary || false,
        }
      : { ...EMPTY_FORM }
  );

  function set(key, val) { setForm(prev => ({ ...prev, [key]: val })); }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    onSave({
      firstName:       form.firstName.trim(),
      lastName:        form.lastName.trim(),
      jerseyNumber:    form.jerseyNumber !== '' ? parseInt(form.jerseyNumber, 10) : null,
      primaryPosition: form.primaryPosition || null,
      graduationYear:  form.graduationYear !== '' ? parseInt(form.graduationYear, 10) : null,
      graduationMonth: form.graduationMonth !== '' ? parseInt(form.graduationMonth, 10) : null,
      shotHand:        form.shotHand || null,
      isCaptain:       form.isCaptain,
      depthTier:       form.depthTier || null,
      email:           form.email.trim() || null,
      sendGameSummary: form.sendGameSummary,
    });
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-surface-3)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)',
    padding: '10px var(--sp-4)', outline: 'none',
  };

  const labelStyle = {
    display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700,
    fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase',
    color: 'var(--color-text-muted)', marginBottom: 'var(--sp-1)',
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 200, backdropFilter: 'blur(2px)',
        }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(480px, 92vw)',
        background: 'var(--color-surface-0)',
        border: '1px solid var(--color-surface-3)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--sp-8)',
        zIndex: 201,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-6)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--color-text-primary)', margin: 0 }}>
            {isEdit ? 'Edit Athlete' : 'Add Athlete'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '1.2rem', cursor: 'pointer', padding: 4 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input style={inputStyle} value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="First" required />
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <input style={inputStyle} value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Last" required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <div>
              <label style={labelStyle}>Jersey #</label>
              <input style={inputStyle} type="number" min="0" max="99" value={form.jerseyNumber} onChange={e => set('jerseyNumber', e.target.value)} placeholder="00" />
            </div>
            <div>
              <label style={labelStyle}>Position</label>
              <select style={inputStyle} value={form.primaryPosition} onChange={e => set('primaryPosition', e.target.value)}>
                <option value="">—</option>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <div>
              <label style={labelStyle}>Grad Year</label>
              <input style={inputStyle} type="number" min="2024" max="2035" value={form.graduationYear} onChange={e => set('graduationYear', e.target.value)} placeholder="2026" />
            </div>
            <div>
              <label style={labelStyle}>
                Grad Month <span style={{ fontWeight: 300, textTransform: 'none', letterSpacing: 0 }}>(opt.)</span>
              </label>
              <select style={inputStyle} value={form.graduationMonth} onChange={e => set('graduationMonth', e.target.value)}>
                <option value="">Default (June)</option>
                {GRAD_MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginBottom: 'var(--sp-6)' }}>
            <div>
              <label style={labelStyle}>Shot Hand</label>
              <select style={inputStyle} value={form.shotHand} onChange={e => set('shotHand', e.target.value)}>
                <option value="">—</option>
                <option value="right">Right</option>
                <option value="left">Left</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Depth Tier</label>
              <select style={inputStyle} value={form.depthTier} onChange={e => set('depthTier', e.target.value)}>
                <option value="">—</option>
                <option value="starter">Starter</option>
                <option value="rotation">Rotation</option>
                <option value="developmental">Developmental</option>
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.isCaptain}
              onChange={e => set('isCaptain', e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--color-gold)', cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              Team Captain
            </span>
          </label>

          <div style={{ marginBottom: 'var(--sp-5)' }}>
            <label style={labelStyle}>Email (optional)</label>
            <input
              style={inputStyle}
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="player@example.com"
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-6)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.sendGameSummary}
              onChange={e => set('sendGameSummary', e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--color-gold)', cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              Send post-game stat summary to this email
            </span>
          </label>

          <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Athlete'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ─── Main component ────────────────────────────────────────────────────────── */

export default function RosterList() {
  const { team } = useAuth();
  const { athletes, loading, error, refresh, addAthlete, updateAthlete } = useRoster(team?.id);

  const [filter,         setFilter]         = useState('All');
  const [showAdd,        setShowAdd]        = useState(false);
  const [editingAthlete, setEditingAthlete] = useState(null);
  const [saving,         setSaving]         = useState(false);
  const [togglingId,     setTogglingId]     = useState(null);

  const filtered = filter === 'All' ? athletes : athletes.filter(a => a.primary_position === filter);

  async function handleAdd(data) {
    setSaving(true);
    try {
      await addAthlete({ ...data, teamId: team.id });
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(data) {
    setSaving(true);
    try {
      await updateAthlete(editingAthlete.id, data);
      setEditingAthlete(null);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(e, athlete) {
    e.preventDefault();
    e.stopPropagation();
    if (togglingId) return;
    setTogglingId(athlete.id);
    try {
      const newStatus = athlete.status === 'injured' ? 'active' : 'injured';
      await updateAthlete(athlete.id, { status: newStatus });
    } finally {
      setTogglingId(null);
    }
  }

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
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>+ Add Athlete</Button>
        </div>
      </div>

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
            background:  filter === f ? 'var(--color-gold-muted)' : 'transparent',
            color:       filter === f ? 'var(--color-gold)' : 'var(--color-text-muted)',
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
          gridTemplateColumns: '44px 1fr 100px 52px 40px 40px 40px 72px',
          gap: 'var(--sp-4)', padding: 'var(--sp-3) var(--sp-6)',
          borderBottom: '1px solid var(--color-surface-3)',
          background: 'var(--color-surface-1)',
        }}>
          {['#', 'Athlete', 'Position', 'Year', 'GP', 'G', 'A', ''].map((col, i) => (
            <span key={i} className="label" style={{ fontSize: '10px' }}>{col}</span>
          ))}
        </div>

        {!loading && filtered.length === 0 && (
          <p style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--color-text-subtle)', fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)' }}>
            {filter !== 'All' ? `No ${filter} players on roster.` : 'No athletes yet. Add your first player.'}
          </p>
        )}

        {filtered.map((p, i) => (
          <div
            key={p.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '44px 1fr 100px 52px 40px 40px 40px 72px',
              gap: 'var(--sp-4)', padding: 'var(--sp-4) var(--sp-6)',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--color-surface-2)' : 'none',
              alignItems: 'center',
              opacity: p.status === 'inactive' ? 0.5 : 1,
            }}
          >
            <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-sm)', color: 'var(--color-gold)' }}>
              {p.jersey_number ?? '—'}
            </span>

            <Link to={`/roster/${p.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', letterSpacing: '0.3px' }}>
                {p.first_name} {p.last_name}
              </span>
              {p.is_captain && <Badge variant="gold">C</Badge>}
              {p.status === 'injured' && <Badge variant="red">INJ</Badge>}
            </Link>

            <Badge variant={POS_VARIANT[p.primary_position] || 'gray'}>
              {p.primary_position || '—'}
            </Badge>

            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', letterSpacing: 1 }}>
              {p.graduation_year ? `'${String(p.graduation_year).slice(-2)}` : '—'}
            </span>

            {[p.games_played, p.goals, p.assists].map((val, idx) => (
              <span key={idx} style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-lg)', color: 'var(--color-text-secondary)', lineHeight: 1 }}>
                {val ?? '—'}
              </span>
            ))}

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 'var(--sp-1)', justifyContent: 'flex-end' }}>
              <button
                onClick={e => toggleStatus(e, p)}
                disabled={togglingId === p.id}
                title={p.status === 'injured' ? 'Mark active' : 'Mark injured'}
                style={{
                  padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid',
                  borderColor: p.status === 'injured' ? 'var(--color-red-border)' : 'var(--color-surface-3)',
                  background:  p.status === 'injured' ? 'var(--color-red-bg)' : 'transparent',
                  color:       p.status === 'injured' ? 'var(--color-red)' : 'var(--color-text-muted)',
                  fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '9px',
                  letterSpacing: '0.8px', textTransform: 'uppercase', cursor: 'pointer',
                  minHeight: '28px', opacity: togglingId === p.id ? 0.5 : 1,
                }}
              >
                {p.status === 'injured' ? 'INJ' : 'OK'}
              </button>
              <button
                onClick={e => { e.preventDefault(); setEditingAthlete(p); }}
                title="Edit athlete"
                style={{
                  padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-surface-3)',
                  background: 'transparent', color: 'var(--color-text-muted)',
                  fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '11px',
                  cursor: 'pointer', minHeight: '28px',
                }}
              >
                ✎
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add modal */}
      {showAdd && (
        <AthleteModal
          onSave={handleAdd}
          onClose={() => setShowAdd(false)}
          saving={saving}
        />
      )}

      {/* Edit modal */}
      {editingAthlete && (
        <AthleteModal
          initial={editingAthlete}
          onSave={handleEdit}
          onClose={() => setEditingAthlete(null)}
          saving={saving}
        />
      )}

    </div>
  );
}
