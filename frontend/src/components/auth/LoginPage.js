import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './LoginPage.css';

/* ─── Inline logo mark (same as TabletNav, larger scale) ─── */
function LogoMark() {
  return (
    <svg className="login-logo-mark" viewBox="0 0 60 78" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <clipPath id="loginPocketClip">
          <path d="M30 10 C43 10 46 14 45 21 L43 42 C42 48 38 49 30 49 C22 49 18 48 17 42 L15 21 C14 14 17 10 30 10Z" />
        </clipPath>
      </defs>
      <path fill="#C9A227" d="M30 2 C47 2 53 9 52 20 L49 50 C47 58 39 62 30 62 C21 62 13 58 11 50 L8 20 C7 9 13 2 30 2Z" />
      <path fill="#0A1018" d="M30 10 C43 10 46 14 45 21 L43 42 C42 48 38 49 30 49 C22 49 18 48 17 42 L15 21 C14 14 17 10 30 10Z" />
      <g clipPath="url(#loginPocketClip)">
        <rect x="8" y="22" width="44" height="2.1" rx="0.3" fill="#C9A227" />
        <rect x="8" y="31" width="44" height="2.1" rx="0.3" fill="#C9A227" />
        <rect x="8" y="40" width="44" height="2.1" rx="0.3" fill="#C9A227" />
      </g>
      <rect x="26" y="62" width="8" height="14" rx="3" fill="#C9A227" />
    </svg>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // Redirect to where the user tried to go, or dashboard
  const from = location.state?.from?.pathname || '/dashboard';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed. Check your credentials.';
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
            <p className="login-tagline">AI Coaching Intelligence</p>
          </div>
        </div>

        {/* Form */}
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
            <label className="login-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="login-input"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            className="login-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

        </form>

        <p className="login-footer">CoachIQ — For the sideline, not the spreadsheet.</p>
      </div>
    </div>
  );
}
