import React, { useState, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../config/api';
import Button from '../common/Button';
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

/* ─── Main component ─────────────────────────────────────── */

export default function SettingsPage() {
  const { coach, team, updateTeam, refreshTeam } = useAuth();

  // ── Team identity state ────────────────────────────────
  const [teamName,     setTeamName]     = useState(team?.teamName     || '');
  const [season,       setSeason]       = useState(team?.season       || '');
  const [gameFormat,   setGameFormat]   = useState(team?.gameFormat   || '10v10');
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
                <option value="10v10">10 v 10</option>
                <option value="9v9">9 v 9</option>
                <option value="7v7">7 v 7</option>
                <option value="6v6">6 v 6</option>
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
