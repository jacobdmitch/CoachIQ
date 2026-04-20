import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './LoginPage.css';

/* ─── Inline logo mark (mirrors LoginPage) ─── */
function LogoMark() {
  return (
    <svg className="login-logo-mark" viewBox="0 0 60 78" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <clipPath id="signupPocketClip">
          <path d="M30 10 C43 10 46 14 45 21 L43 42 C42 48 38 49 30 49 C22 49 18 48 17 42 L15 21 C14 14 17 10 30 10Z" />
        </clipPath>
      </defs>
      <path fill="#C9A227" d="M30 2 C47 2 53 9 52 20 L49 50 C47 58 39 62 30 62 C21 62 13 58 11 50 L8 20 C7 9 13 2 30 2Z" />
      <path fill="#0A1018" d="M30 10 C43 10 46 14 45 21 L43 42 C42 48 38 49 30 49 C22 49 18 48 17 42 L15 21 C14 14 17 10 30 10Z" />
      <g clipPath="url(#signupPocketClip)">
        <rect x="8" y="22" width="44" height="2.1" rx="0.3" fill="#C9A227" />
        <rect x="8" y="31" width="44" height="2.1" rx="0.3" fill="#C9A227" />
        <rect x="8" y="40" width="44" height="2.1" rx="0.3" fill="#C9A227" />
      </g>
      <rect x="26" y="62" width="8" height="14" rx="3" fill="#C9A227" />
    </svg>
  );
}

export default function SignupPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName,       setFirstName]       = useState('');
  const [lastName,        setLastName]        = useState('');
  const [teamName,        setTeamName]        = useState('');
  const [error,           setError]           = useState('');
  const [loading,         setLoading]         = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();

    // Client-side validation. Kept minimal and aligned with the backend so
    // the user sees the same rules locally that the server enforces.
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await register({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        teamName:  teamName.trim() || undefined,
      });
      // After register, AuthContext has set token + coach + (optional) team.
      // If a team was created at signup, land on dashboard. If not, land on
      // /settings so the coach can create their team before anything else.
      navigate(teamName.trim() ? '/dashboard' : '/settings', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || 'Signup failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">

        {/* Brand */}
        <div className="login-logo">
          <LogoMark />
          <div>
            <p className="login-wordmark">COACH<span>IQ</span></p>
            <p className="login-tagline">Create your account</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <div className="login-field">
            <label className="login-label" htmlFor="email">Email</label>
            <input
              id="email"
              className="login-input"
              type="email"
              placeholder="coach@team.com"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="firstName">First name</label>
            <input
              id="firstName"
              className="login-input"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="lastName">Last name</label>
            <input
              id="lastName"
              className="login-input"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="login-input"
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              className="login-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="teamName">Team name (optional)</label>
            <input
              id="teamName"
              className="login-input"
              type="text"
              placeholder="You can add this later"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            className="login-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

        </form>

        <p className="login-footer">
          Already have an account? <Link to="/login" style={{ color: 'var(--color-gold)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
