import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAthlete } from '../../hooks/useRoster';
import { useRoster } from '../../hooks/useRoster';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../config/api';
import StatCard from '../common/StatCard';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { GRAD_MONTHS } from './gradMonths';

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

  const [editing,       setEditing]       = useState(false);
  const [editEmail,     setEditEmail]     = useState('');
  const [editSummary,   setEditSummary]   = useState(false);
  const [editGradYear,  setEditGradYear]  = useState('');
  const [editGradMonth, setEditGradMonth] = useState('');
  const [editShotHand,  setEditShotHand]  = useState('');
  const [editCaptain,   setEditCaptain]   = useState(false);
  const [editDepthTier, setEditDepthTier] = useState('');
  const [editSkills,    setEditSkills]    = useState({});
  const [saving,        setSaving]        = useState(false);

  // Previous-season history
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    setHistoryLoading(true);
    apiClient.get(`/athletes/${athleteId}/season-history`)
      .then(res => { if (!cancelled) setHistory(res.data.seasons || []); })
      .catch(() => { if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [athleteId]);

  // Share-link state
  const [shares, setShares]         = useState([]);
  const [shareBusy, setShareBusy]   = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const loadShares = useCallback(async () => {
    if (!athleteId) return;
    try {
      const res = await apiClient.get(`/public/athletes/${athleteId}/share`);
      setShares(res.data.shares || []);
    } catch {
      // Non-fatal — coaches without tokens yet just see the Create button.
    }
  }, [athleteId]);

  useEffect(() => { loadShares(); }, [loadShares]);

  const activeShare = shares.find(s => !s.revoked_at && (!s.expires_at || new Date(s.expires_at) > new Date())) || null;

  function shareUrl(token) {
    return `${window.location.origin}/share/player/${token}`;
  }

  async function createShare() {
    setShareBusy(true);
    try {
      await apiClient.post(`/public/athletes/${athleteId}/share`);
      await loadShares();
    } finally {
      setShareBusy(false);
    }
  }

  async function revokeShares() {
    if (!window.confirm('Revoke this share link? Anyone who saved the URL will lose access.')) return;
    setShareBusy(true);
    try {
      await apiClient.delete(`/public/athletes/${athleteId}/share`);
      await loadShares();
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShare() {
    if (!activeShare) return;
    try {
      await navigator.clipboard.writeText(shareUrl(activeShare.token));
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Fall back silently — URL is still visible in the input.
    }
  }

  function openEdit() {
    setEditEmail(athlete?.email || '');
    setEditSummary(athlete?.send_game_summary || false);
    setEditGradYear(athlete?.graduation_year ?? '');
    setEditGradMonth(athlete?.graduation_month ?? '');
    setEditShotHand(athlete?.shot_hand || '');
    setEditCaptain(athlete?.is_captain || false);
    setEditDepthTier(athlete?.depth_tier || '');
    setEditSkills({
      skillShooting:       athlete?.skill_shooting       ?? '',
      skillDodging:        athlete?.skill_dodging        ?? '',
      skillPassing:        athlete?.skill_passing        ?? '',
      skillFieldAwareness: athlete?.skill_field_awareness ?? '',
      skillDefense:        athlete?.skill_defense        ?? '',
      skillGroundBalls:    athlete?.skill_ground_balls   ?? '',
      skillTransition:     athlete?.skill_transition     ?? '',
      skillFaceoff:        athlete?.skill_faceoff        ?? '',
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const skillsPayload = Object.fromEntries(
        Object.entries(editSkills).map(([k, v]) => {
          if (v === '' || v === null || v === undefined) return [k, null];
          const n = Number(v);
          return [k, Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : null];
        })
      );
      await updateAthlete(athleteId, {
        email: editEmail.trim() || null,
        sendGameSummary: editSummary,
        graduationYear:  editGradYear  !== '' ? parseInt(editGradYear, 10)  : null,
        graduationMonth: editGradMonth !== '' ? parseInt(editGradMonth, 10) : null,
        shotHand:        editShotHand || null,
        isCaptain:       editCaptain,
        depthTier:       editDepthTier || null,
        ...skillsPayload,
      });
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
  const isGoalie = athlete.primary_position === 'Goalie' || athlete.secondary_position === 'Goalie';
  const isFOGO   = athlete.primary_position === 'FOGO'   || athlete.secondary_position === 'FOGO';
  const savesPerGame = athlete.games_played > 0
    ? (Number(athlete.saves) / Number(athlete.games_played)).toFixed(1)
    : '0.0';
  const faceoffTotal = Number(athlete.faceoff_wins ?? 0) + Number(athlete.faceoff_losses ?? 0);
  const faceoffPct = faceoffTotal > 0
    ? Math.round((Number(athlete.faceoff_wins) / faceoffTotal) * 100)
    : 0;

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
              {athlete.is_captain && <Badge variant="gold">Captain</Badge>}
              {athlete.depth_tier && (
                <Badge variant="gray">
                  {athlete.depth_tier.charAt(0).toUpperCase() + athlete.depth_tier.slice(1)}
                </Badge>
              )}
              {athlete.status === 'injured' && <Badge variant="red" dot>Injured</Badge>}
            </div>
            <p className="page-subtitle">
              {[
                athlete.graduation_year ? `Class of ${athlete.graduation_year}` : null,
                athlete.secondary_position ? `Also plays ${athlete.secondary_position}` : null,
                athlete.shot_hand
                  ? `Shoots ${athlete.shot_hand === 'both' ? 'both hands' : athlete.shot_hand}`
                  : null,
              ].filter(Boolean).join(' · ')}
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

      {/* Goalie-specific stats */}
      {isGoalie && (
        <div className="grid-4" style={{ marginBottom: 'var(--sp-8)' }}>
          <StatCard label="Saves"         value={athlete.saves ?? 0} />
          <StatCard label="Saves / Game"  value={savesPerGame} />
        </div>
      )}

      {/* FOGO-specific stats */}
      {isFOGO && (
        <div className="grid-4" style={{ marginBottom: 'var(--sp-8)' }}>
          <StatCard label="Faceoff Wins"   value={athlete.faceoff_wins   ?? 0} />
          <StatCard label="Faceoff Losses" value={athlete.faceoff_losses ?? 0} />
          <StatCard label="FO Win %"       value={faceoffPct} unit="%" />
        </div>
      )}

      {/* Season History — one row per season the athlete logged events in */}
      {history.length > 0 && (() => {
        const cols = ['1.6fr', '52px', '40px', '40px', '40px'];
        const heads = ['Season', 'GP', 'G', 'A', 'GB'];
        if (isGoalie) { cols.push('44px'); heads.push('SV'); }
        if (isFOGO)   { cols.push('52px'); heads.push('FO%'); }
        const gridTemplateColumns = cols.join(' ');
        return (
          <>
            <p className="section-heading">Season History</p>
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--sp-8)' }}>
              <div style={{
                display: 'grid', gridTemplateColumns,
                gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-5)',
                borderBottom: '1px solid var(--color-surface-3)',
                background: 'var(--color-surface-1)',
              }}>
                {heads.map((col, i) => (
                  <span key={i} className="label" style={{ fontSize: '10px' }}>{col}</span>
                ))}
              </div>
              {history.map((s, i, arr) => {
                const foTotal = Number(s.faceoff_wins ?? 0) + Number(s.faceoff_losses ?? 0);
                const foPct   = foTotal > 0 ? Math.round((Number(s.faceoff_wins) / foTotal) * 100) : 0;
                return (
                  <div
                    key={s.season_id}
                    style={{
                      display: 'grid', gridTemplateColumns,
                      gap: 'var(--sp-3)', padding: 'var(--sp-4) var(--sp-5)',
                      borderBottom: i < arr.length - 1 ? '1px solid var(--color-surface-2)' : 'none',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                      {s.season_name}
                    </span>
                    {[s.games_played, s.goals, s.assists, s.ground_balls].map((val, idx) => (
                      <span key={idx} style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
                        {val ?? 0}
                      </span>
                    ))}
                    {isGoalie && (
                      <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
                        {s.saves ?? 0}
                      </span>
                    )}
                    {isFOGO && (
                      <span style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
                        {`${foPct}%`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}
      {historyLoading && history.length === 0 && (
        <p style={{ marginBottom: 'var(--sp-8)', fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          Loading season history…
        </p>
      )}

      {/* Skill ratings — always shown so coaches know ratings drive line suggestions */}
      <p className="section-heading">Skill Ratings</p>
      {(athlete.skill_shooting || athlete.skill_passing || athlete.skill_defense
        || athlete.skill_dodging || athlete.skill_field_awareness
        || athlete.skill_ground_balls || athlete.skill_faceoff || athlete.skill_transition) ? (
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
      ) : (
        <div className="card" style={{ marginBottom: 'var(--sp-8)' }}>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)',
            color: 'var(--color-text-muted)', lineHeight: 'var(--leading-normal)', margin: 0,
          }}>
            No ratings yet — add 1-10 ratings in Edit Profile to power line suggestions.
          </p>
        </div>
      )}

      {/* Share stats (P5) */}
      <p className="section-heading">Share Stats with {athlete.first_name}</p>
      <div className="card" style={{ marginBottom: 'var(--sp-8)' }}>
        {activeShare ? (
          <>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 'var(--sp-3)',
            }}>
              Anyone with this link can view {athlete.first_name}'s season stats (no login).
              Expires {activeShare.expires_at ? new Date(activeShare.expires_at).toLocaleDateString() : 'never'}.
              Views: {activeShare.view_count}.
            </p>
            <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'stretch', flexWrap: 'wrap' }}>
              <input
                type="text"
                readOnly
                value={shareUrl(activeShare.token)}
                onClick={e => e.target.select()}
                style={{
                  flex: '1 1 280px', minWidth: 200,
                  background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                  fontFamily: 'var(--font-stats)', fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-primary)', outline: 'none',
                }}
              />
              <Button variant="primary" size="sm" onClick={copyShare}>
                {shareCopied ? 'Copied' : 'Copy'}
              </Button>
              <Button variant="ghost" size="sm" onClick={revokeShares} disabled={shareBusy}>
                Revoke
              </Button>
            </div>
          </>
        ) : (
          <>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 'var(--sp-3)',
            }}>
              Generate a private link for {athlete.first_name} or their family to see
              season stats, no account required. Coach notes stay hidden.
            </p>
            <Button variant="primary" size="sm" onClick={createShare} disabled={shareBusy}>
              {shareBusy ? 'Creating…' : 'Create Share Link'}
            </Button>
          </>
        )}
      </div>

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

            {/* Graduation — drives the daily auto-deactivate sweep */}
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
              letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)',
              marginBottom: 'var(--sp-2)',
            }}>
              Graduation
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)', marginBottom: 'var(--sp-3)',
            }}>
              Athlete auto-deactivates the day after this date. Month defaults to June.
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 'var(--sp-3)', marginBottom: 'var(--sp-6)',
            }}>
              <label>
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-1)' }}>
                  Grad Year
                </span>
                <input
                  type="number"
                  min="2024"
                  max="2035"
                  value={editGradYear}
                  onChange={e => setEditGradYear(e.target.value)}
                  placeholder="2026"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-primary)', outline: 'none',
                  }}
                />
              </label>
              <label>
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-1)' }}>
                  Grad Month
                </span>
                <select
                  value={editGradMonth}
                  onChange={e => setEditGradMonth(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-primary)', outline: 'none',
                  }}
                >
                  <option value="">Default (June)</option>
                  {GRAD_MONTHS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Role — shot hand, captain, depth tier */}
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
              letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)',
              marginBottom: 'var(--sp-2)',
            }}>
              Role
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)',
            }}>
              <label>
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-1)' }}>
                  Shot Hand
                </span>
                <select
                  value={editShotHand}
                  onChange={e => setEditShotHand(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-primary)', outline: 'none',
                  }}
                >
                  <option value="">—</option>
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                  <option value="both">Both</option>
                </select>
              </label>
              <label>
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-1)' }}>
                  Depth Tier
                </span>
                <select
                  value={editDepthTier}
                  onChange={e => setEditDepthTier(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-primary)', outline: 'none',
                  }}
                >
                  <option value="">—</option>
                  <option value="starter">Starter</option>
                  <option value="rotation">Rotation</option>
                  <option value="developmental">Developmental</option>
                </select>
              </label>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', cursor: 'pointer', marginBottom: 'var(--sp-6)' }}>
              <input
                type="checkbox"
                checked={editCaptain}
                onChange={e => setEditCaptain(e.target.checked)}
                style={{ accentColor: 'var(--color-gold)', width: 16, height: 16, flexShrink: 0 }}
              />
              <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                Team Captain
              </span>
            </label>

            {/* Skill ratings — 1-10; blank clears the value */}
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
              letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)',
              marginBottom: 'var(--sp-2)',
            }}>
              Skill Ratings (1–10)
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)', marginBottom: 'var(--sp-3)',
            }}>
              Used by the line generator to rank players per role.
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 'var(--sp-2) var(--sp-3)', marginBottom: 'var(--sp-6)',
            }}>
              {[
                { key: 'skillShooting',       label: 'Shooting' },
                { key: 'skillDodging',        label: 'Dodging' },
                { key: 'skillPassing',        label: 'Passing' },
                { key: 'skillFieldAwareness', label: 'Field IQ' },
                { key: 'skillDefense',        label: 'Defense' },
                { key: 'skillGroundBalls',    label: 'Ground Balls' },
                { key: 'skillTransition',     label: 'Transition' },
                { key: 'skillFaceoff',        label: 'Faceoff' },
              ].map(s => (
                <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                  <span style={{
                    flex: 1, fontFamily: 'var(--font-body)', fontWeight: 600,
                    fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
                  }}>
                    {s.label}
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={editSkills[s.key] ?? ''}
                    onChange={e => setEditSkills(prev => ({ ...prev, [s.key]: e.target.value }))}
                    placeholder="—"
                    style={{
                      width: 56, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)', padding: '6px 8px',
                      fontFamily: 'var(--font-stats)', fontSize: 'var(--text-sm)',
                      color: 'var(--color-text-primary)', textAlign: 'center', outline: 'none',
                    }}
                  />
                </label>
              ))}
            </div>

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
