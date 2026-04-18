import React, { useState, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../config/api';
import Button from '../common/Button';
import { useSeasons } from '../../hooks/useSeasons';
import './SettingsPage.css';

/* ─── Preset brand colors (quick swatches) ───────────────── */

const PRESET_COLORS = [
  '#C9A227', // CoachIQ gold
  '#1E40AF', // blue
  '#166534', // green
  '#9F1239', // red
  '#7C3AED', // purple
  '#C2410C', // orange
  '#0E7490', // teal
  '#374151', // slate
];

/* ─── Helpers ────────────────────────────────────────────── */

function isValidHex(str) {
  return /^#[0-9A-Fa-f]{6}$/.test(str);
}

function buildLogoUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const base = process.env.REACT_APP_SOCKET_URL || window.location.origin;
  return `${base}${path}`;
}

/* ─── Logo preview placeholder ───────────────────────────── */

function LogoPlaceholder({ teamName }) {
  const initials = teamName
    ? teamName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'TM';
  return <span className="logo-preview-placeholder">{initials}</span>;
}

/* ─── Seasons manager ────────────────────────────────────── */

function fmtShort(iso) {
  if (!iso) return '';
  // Parse as UTC to avoid TZ-shifted month/day on the boundary
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function SeasonsManager({ teamId }) {
  const { seasons, loading, error, createSeason, updateSeason, deleteSeason, refresh } =
    useSeasons(teamId);

  // editing: null | 'new' | seasonId
  const [editing, setEditing] = useState(null);
  const [name,      setName]      = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState(null);
  const [rowError,  setRowError]  = useState(null); // { id, msg }

  function openNew() {
    const year = new Date().getFullYear();
    setEditing('new');
    setName(`${year} Season`);
    setStartDate(`${year}-01-01`);
    setEndDate(`${year}-12-31`);
    setFormError(null);
  }

  function openEdit(s) {
    setEditing(s.id);
    setName(s.name);
    setStartDate(s.start_date.slice(0, 10));
    setEndDate(s.end_date.slice(0, 10));
    setFormError(null);
    setRowError(null);
  }

  function cancel() {
    setEditing(null);
    setFormError(null);
  }

  async function save(e) {
    e.preventDefault();
    if (!name.trim() || !startDate || !endDate) {
      setFormError('Name, start date, and end date are required.');
      return;
    }
    if (endDate < startDate) {
      setFormError('End date must be on or after start date.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing === 'new') {
        await createSeason({ name: name.trim(), startDate, endDate });
      } else {
        await updateSeason(editing, { name: name.trim(), startDate, endDate });
      }
      setEditing(null);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(season) {
    setRowError(null);
    const warn = season.completed_game_count > 0
      ? `Cannot delete "${season.name}" — ${season.completed_game_count} played game(s) are attached.`
      : season.game_count > 0
        ? `Delete "${season.name}"? ${season.game_count} scheduled game(s) will be removed.`
        : `Delete "${season.name}"?`;
    // Block client-side if played games; the server enforces this too.
    if (season.completed_game_count > 0) {
      setRowError({ id: season.id, msg: warn });
      return;
    }
    if (!window.confirm(warn)) return;
    try {
      await deleteSeason(season.id);
    } catch (err) {
      setRowError({ id: season.id, msg: err.response?.data?.error || 'Delete failed.' });
    }
  }

  return (
    <div className="settings-section">
      <p className="settings-section-title">Seasons</p>

      <div className="card">
        {error && (
          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <span className="settings-save-status error">{error}</span>
            <Button variant="ghost" size="sm" onClick={refresh} style={{ marginLeft: 'var(--sp-3)' }}>
              Retry
            </Button>
          </div>
        )}

        {!loading && seasons.length === 0 && editing !== 'new' && (
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)',
            color: 'var(--color-text-muted)', marginBottom: 'var(--sp-4)',
          }}>
            No seasons yet. Add one to organize games by season.
          </p>
        )}

        {seasons.map((s, i) => (
          <React.Fragment key={s.id}>
            {editing === s.id ? (
              <SeasonForm
                title="Edit Season"
                name={name} setName={setName}
                startDate={startDate} setStartDate={setStartDate}
                endDate={endDate} setEndDate={setEndDate}
                saving={saving} error={formError}
                onCancel={cancel} onSave={save}
              />
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
                padding: 'var(--sp-3) 0',
                borderBottom: i < seasons.length - 1 ? '1px solid var(--color-surface-2)' : 'none',
              }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', margin: 0 }}>
                    {s.name}
                  </p>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {fmtShort(s.start_date)} – {fmtShort(s.end_date)}
                    {s.game_count > 0 && (
                      <span style={{ marginLeft: 'var(--sp-3)' }}>
                        · {s.game_count} game{s.game_count === 1 ? '' : 's'}
                        {s.completed_game_count > 0 && ` (${s.completed_game_count} played)`}
                      </span>
                    )}
                  </p>
                  {rowError?.id === s.id && (
                    <p className="settings-save-status error" style={{ marginTop: 4 }}>{rowError.msg}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(s)}>Delete</Button>
              </div>
            )}
          </React.Fragment>
        ))}

        {editing === 'new' && (
          <div style={{ marginTop: seasons.length > 0 ? 'var(--sp-4)' : 0 }}>
            <SeasonForm
              title="New Season"
              name={name} setName={setName}
              startDate={startDate} setStartDate={setStartDate}
              endDate={endDate} setEndDate={setEndDate}
              saving={saving} error={formError}
              onCancel={cancel} onSave={save}
            />
          </div>
        )}

        {editing == null && (
          <div style={{ marginTop: seasons.length > 0 ? 'var(--sp-4)' : 0 }}>
            <Button variant="outline" size="sm" onClick={openNew}>+ Add Season</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SeasonForm({ title, name, setName, startDate, setStartDate, endDate, setEndDate, saving, error, onCancel, onSave }) {
  return (
    <form onSubmit={onSave} className="settings-form" style={{
      padding: 'var(--sp-4) 0',
      borderTop: '1px solid var(--color-surface-2)',
      borderBottom: '1px solid var(--color-surface-2)',
    }}>
      <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-subtle)', margin: 0 }}>
        {title}
      </p>
      <div className="settings-field">
        <label className="settings-label">Name</label>
        <input
          className="settings-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Spring 2026"
          autoFocus
        />
      </div>
      <div className="settings-grid-2">
        <div className="settings-field">
          <label className="settings-label">Start Date</label>
          <input className="settings-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="settings-field">
          <label className="settings-label">End Date</label>
          <input className="settings-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>
      <div className="settings-save-row">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Season'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        {error && <span className="settings-save-status error">{error}</span>}
      </div>
    </form>
  );
}

/* ─── Main component ─────────────────────────────────────── */

export default function SettingsPage() {
  const { coach, team, updateTeam, refreshTeam } = useAuth();

  // ── Team identity state ────────────────────────────────
  const [teamName,     setTeamName]     = useState(team?.teamName     || '');
  const [season,       setSeason]       = useState(team?.season       || '');
  const [gameFormat,   setGameFormat]   = useState(team?.gameFormat   || 'standard');
  const [primaryColor, setPrimaryColor] = useState(team?.primaryColor || '#C9A227');
  const [hexInput,     setHexInput]     = useState(team?.primaryColor || '#C9A227');
  const [teamSaving,   setTeamSaving]   = useState(false);
  const [teamStatus,   setTeamStatus]   = useState(null); // null | { type: 'success'|'error', msg }

  // ── Personal info state ────────────────────────────────
  const [firstName,    setFirstName]    = useState(coach?.firstName || '');
  const [lastName,     setLastName]     = useState(coach?.lastName  || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState(null);

  // ── Password state ─────────────────────────────────────
  const [currentPw,   setCurrentPw]    = useState('');
  const [newPw,       setNewPw]        = useState('');
  const [confirmPw,   setConfirmPw]    = useState('');
  const [pwSaving,    setPwSaving]     = useState(false);
  const [pwStatus,    setPwStatus]     = useState(null);

  // ── Logo upload state ──────────────────────────────────
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoStatus,    setLogoStatus]    = useState(null);
  const fileInputRef = useRef(null);

  // ─── Save team details ────────────────────────────────────────────────────

  async function handleTeamSave(e) {
    e.preventDefault();
    if (!team?.id) return;
    setTeamSaving(true);
    setTeamStatus(null);
    try {
      const res = await apiClient.patch(`/teams/${team.id}`, {
        teamName,
        season,
        gameFormat,
        primaryColor: isValidHex(primaryColor) ? primaryColor : undefined,
      });
      // Optimistic update then refresh
      updateTeam({
        teamName:     res.data.team.team_name,
        season:       res.data.team.season,
        gameFormat:   res.data.team.game_format,
        primaryColor: res.data.team.primary_color,
      });
      setTeamStatus({ type: 'success', msg: 'Saved.' });
    } catch (err) {
      setTeamStatus({ type: 'error', msg: err.response?.data?.error || 'Save failed.' });
    } finally {
      setTeamSaving(false);
    }
  }

  // ─── Logo upload ──────────────────────────────────────────────────────────

  const handleLogoFile = useCallback(async (file) => {
    if (!file || !team?.id) return;
    setLogoUploading(true);
    setLogoStatus(null);
    const formData = new FormData();
    formData.append('logo', file);
    try {
      await apiClient.post(`/teams/${team.id}/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshTeam();
      setLogoStatus({ type: 'success', msg: 'Logo updated.' });
    } catch (err) {
      setLogoStatus({ type: 'error', msg: err.response?.data?.error || 'Upload failed.' });
    } finally {
      setLogoUploading(false);
    }
  }, [team?.id, refreshTeam]);

  async function handleLogoRemove() {
    if (!team?.id) return;
    setLogoUploading(true);
    try {
      await apiClient.delete(`/teams/${team.id}/logo`);
      updateTeam({ logoUrl: null });
      setLogoStatus({ type: 'success', msg: 'Logo removed.' });
    } catch {
      setLogoStatus({ type: 'error', msg: 'Remove failed.' });
    } finally {
      setLogoUploading(false);
    }
  }

  // ─── Save personal profile ────────────────────────────────────────────────

  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileStatus(null);
    try {
      await apiClient.patch('/auth/profile', { firstName, lastName });
      setProfileStatus({ type: 'success', msg: 'Saved.' });
    } catch (err) {
      setProfileStatus({ type: 'error', msg: err.response?.data?.error || 'Save failed.' });
    } finally {
      setProfileSaving(false);
    }
  }

  // ─── Change password ──────────────────────────────────────────────────────

  async function handlePasswordSave(e) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwStatus({ type: 'error', msg: 'Passwords do not match.' });
      return;
    }
    if (newPw.length < 8) {
      setPwStatus({ type: 'error', msg: 'Password must be at least 8 characters.' });
      return;
    }
    setPwSaving(true);
    setPwStatus(null);
    try {
      await apiClient.post('/auth/change-password', { currentPassword: currentPw, newPassword: newPw });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwStatus({ type: 'success', msg: 'Password updated.' });
    } catch (err) {
      setPwStatus({ type: 'error', msg: err.response?.data?.error || 'Change failed.' });
    } finally {
      setPwSaving(false);
    }
  }

  // ─── Hex color input sync ─────────────────────────────────────────────────

  function handleHexChange(val) {
    setHexInput(val);
    if (isValidHex(val)) setPrimaryColor(val);
  }

  function handleSwatchClick(color) {
    setPrimaryColor(color);
    setHexInput(color);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const logoSrc = buildLogoUrl(team?.logoUrl);

  return (
    <div className="page-content">

      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Team identity and account details</p>
        </div>
      </div>

      {/* ── Team Identity ──────────────────────────────────────── */}
      <div className="settings-section">
        <p className="settings-section-title">Team Identity</p>

        <div className="card">

          {/* Logo upload */}
          <div className="settings-field" style={{ marginBottom: 'var(--sp-6)' }}>
            <span className="settings-label">Team Logo</span>
            <div className="logo-upload-area">
              <div className="logo-preview">
                {logoSrc
                  ? <img src={logoSrc} alt="Team logo" />
                  : <LogoPlaceholder teamName={teamName} />
                }
              </div>
              <div className="logo-upload-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="logo-file-input"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  onChange={e => handleLogoFile(e.target.files?.[0])}
                />
                <button
                  className="logo-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoUploading}
                >
                  {logoUploading ? 'Uploading…' : logoSrc ? 'Replace Logo' : 'Upload Logo'}
                </button>
                {logoSrc && (
                  <button
                    className="logo-remove-btn"
                    onClick={handleLogoRemove}
                    disabled={logoUploading}
                  >
                    Remove
                  </button>
                )}
                <span className="logo-upload-hint">JPEG, PNG, WebP or SVG · max 5 MB</span>
                {logoStatus && (
                  <span className={`settings-save-status ${logoStatus.type}`}>{logoStatus.msg}</span>
                )}
              </div>
            </div>
          </div>

          {/* Team form */}
          <form onSubmit={handleTeamSave} className="settings-form">

            <div className="settings-grid-2">
              <div className="settings-field">
                <label className="settings-label">Team Name</label>
                <input
                  className="settings-input"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  placeholder="e.g. Westfield Warriors"
                />
              </div>
              <div className="settings-field">
                <label className="settings-label">Season</label>
                <input
                  className="settings-input"
                  value={season}
                  onChange={e => setSeason(e.target.value)}
                  placeholder="e.g. Spring 2026"
                />
              </div>
            </div>

            <div className="settings-field">
              <label className="settings-label">Game Format</label>
              <select
                className="settings-select"
                value={gameFormat}
                onChange={e => setGameFormat(e.target.value)}
              >
                <option value="standard">Standard (10v10)</option>
                <option value="6s">Sixes (6v6)</option>
              </select>
            </div>

            {/* Brand color */}
            <div className="settings-field">
              <label className="settings-label">Accent Color</label>
              <div className="color-swatch-row">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`color-swatch${primaryColor === c ? ' selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => handleSwatchClick(c)}
                    aria-label={c}
                  />
                ))}
                <div className="color-input-wrapper">
                  <div
                    className="color-swatch"
                    style={{
                      background: isValidHex(hexInput) ? hexInput : '#374151',
                      border: '2px dashed var(--color-surface-3)',
                    }}
                  />
                  <input
                    className="color-hex-input"
                    value={hexInput}
                    maxLength={7}
                    onChange={e => handleHexChange(e.target.value)}
                    placeholder="#C9A227"
                  />
                </div>
              </div>
            </div>

            <div className="settings-save-row">
              <Button type="submit" variant="primary" disabled={teamSaving}>
                {teamSaving ? 'Saving…' : 'Save Team'}
              </Button>
              {teamStatus && (
                <span className={`settings-save-status ${teamStatus.type}`}>{teamStatus.msg}</span>
              )}
            </div>

          </form>
        </div>
      </div>

      {/* ── Seasons ─────────────────────────────────────────────── */}
      {team?.id && <SeasonsManager teamId={team.id} />}

      {/* ── Personal Info ───────────────────────────────────────── */}
      <div className="settings-section">
        <p className="settings-section-title">Personal Info</p>

        <div className="card">
          <form onSubmit={handleProfileSave} className="settings-form">

            <div className="settings-grid-2">
              <div className="settings-field">
                <label className="settings-label">First Name</label>
                <input
                  className="settings-input"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div className="settings-field">
                <label className="settings-label">Last Name</label>
                <input
                  className="settings-input"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="settings-field">
              <label className="settings-label">Email</label>
              <input
                className="settings-input"
                value={coach?.email || ''}
                disabled
                style={{ opacity: 0.55 }}
              />
            </div>

            <div className="settings-save-row">
              <Button type="submit" variant="primary" disabled={profileSaving}>
                {profileSaving ? 'Saving…' : 'Save Profile'}
              </Button>
              {profileStatus && (
                <span className={`settings-save-status ${profileStatus.type}`}>{profileStatus.msg}</span>
              )}
            </div>

          </form>
        </div>
      </div>

      {/* ── Password ────────────────────────────────────────────── */}
      <div className="settings-section">
        <p className="settings-section-title">Change Password</p>

        <div className="card">
          <form onSubmit={handlePasswordSave} className="settings-form">

            <div className="settings-field">
              <label className="settings-label">Current Password</label>
              <input
                className="settings-input"
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
              />
            </div>

            <div className="settings-grid-2">
              <div className="settings-field">
                <label className="settings-label">New Password</label>
                <input
                  className="settings-input"
                  type="password"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="8+ characters"
                  autoComplete="new-password"
                />
              </div>
              <div className="settings-field">
                <label className="settings-label">Confirm Password</label>
                <input
                  className="settings-input"
                  type="password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="settings-save-row">
              <Button
                type="submit"
                variant="secondary"
                disabled={pwSaving || !currentPw || !newPw || !confirmPw}
              >
                {pwSaving ? 'Updating…' : 'Update Password'}
              </Button>
              {pwStatus && (
                <span className={`settings-save-status ${pwStatus.type}`}>{pwStatus.msg}</span>
              )}
            </div>

          </form>
        </div>
      </div>

    </div>
  );
}
