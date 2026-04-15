import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './TabletNav.css';

/* ─── Team logo image (when uploaded) ───────────────────────
   Replaces the default lacrosse-head SVG when a team has a
   custom logo_url stored.
   ─────────────────────────────────────────────────────────── */
function TeamLogo({ url, name }) {
  const src = url.startsWith('http')
    ? url
    : `${process.env.REACT_APP_SOCKET_URL || window.location.origin}${url}`;
  return (
    <img
      className="nav-team-logo"
      src={src}
      alt={name ? `${name} logo` : 'Team logo'}
      aria-hidden="false"
    />
  );
}

/* ─── Inline logo mark ───────────────────────────────────────
   Compact lacrosse head: gold frame → dark pocket → gold mesh
   Matches the brand SVG proportions at small sizes.
   ─────────────────────────────────────────────────────────── */
function LogoMark() {
  return (
    <svg
      className="nav-logo-mark"
      viewBox="0 0 60 78"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="navPocketClip">
          <path d="M30 10 C43 10 46 14 45 21 L43 42 C42 48 38 49 30 49 C22 49 18 48 17 42 L15 21 C14 14 17 10 30 10Z" />
        </clipPath>
      </defs>
      {/* Outer head — gold */}
      <path
        fill="#C9A227"
        d="M30 2 C47 2 53 9 52 20 L49 50 C47 58 39 62 30 62 C21 62 13 58 11 50 L8 20 C7 9 13 2 30 2Z"
      />
      {/* Inner pocket — dark */}
      <path
        fill="#0A1018"
        d="M30 10 C43 10 46 14 45 21 L43 42 C42 48 38 49 30 49 C22 49 18 48 17 42 L15 21 C14 14 17 10 30 10Z"
      />
      {/* Mesh lines — gold, clipped to pocket */}
      <g clipPath="url(#navPocketClip)">
        <rect x="8"  y="22" width="44" height="2.1" rx="0.3" fill="#C9A227" />
        <rect x="8"  y="31" width="44" height="2.1" rx="0.3" fill="#C9A227" />
        <rect x="8"  y="40" width="44" height="2.1" rx="0.3" fill="#C9A227" />
      </g>
      {/* Shaft */}
      <rect x="26" y="62" width="8" height="14" rx="3" fill="#C9A227" />
    </svg>
  );
}

/* ─── Tab icons (inline SVG, currentColor) ─────────────────── */

function IconDashboard() {
  return (
    <svg className="nav-tab-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

function IconRoster() {
  return (
    <svg className="nav-tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="5.5" cy="5" r="2.3" fill="currentColor" stroke="none" />
      <path d="M1 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
      <circle cx="12" cy="5" r="1.8" fill="currentColor" stroke="none" opacity="0.55" />
      <path d="M14.5 14c0-2-1.2-3-3-3" opacity="0.55" />
    </svg>
  );
}

function IconGame() {
  return (
    <svg className="nav-tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 1.5v13M1.5 8h13" />
      <path d="M3.2 3.2 C5 6 11 6 12.8 3.2" />
      <path d="M3.2 12.8 C5 10 11 10 12.8 12.8" />
    </svg>
  );
}

function IconPlays() {
  return (
    <svg className="nav-tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1" y="1" width="14" height="14" rx="2" />
      <circle cx="4"  cy="5"  r="1"   fill="currentColor" stroke="none" />
      <circle cx="12" cy="5"  r="1"   fill="currentColor" stroke="none" />
      <circle cx="8"  cy="11" r="1"   fill="currentColor" stroke="none" />
      <path d="M4 5 Q8 7.5 12 5"  strokeDasharray="2 1.5" strokeLinecap="round" />
      <path d="M12 5 Q10 8.5 8 11" strokeDasharray="2 1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconPractice() {
  return (
    <svg className="nav-tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="1" y="3" width="14" height="12" rx="2" />
      <path d="M5 1v4M11 1v4" />
      <path d="M1 7h14" />
      <rect x="4"  y="10" width="2" height="2" rx="0.3" fill="currentColor" stroke="none" />
      <rect x="10" y="10" width="2" height="2" rx="0.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="nav-tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M3.1 12.9l1.1-1.1M11.8 4.2l1.1-1.1" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg className="nav-tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6 6.2c0-1.1.9-2 2-2s2 .9 2 2c0 1-.7 1.6-1.4 2-.5.3-.6.7-.6 1.1" />
      <circle cx="8" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ─── Route definitions ────────────────────────────────────── */

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: IconDashboard },
  { to: '/roster',    label: 'Roster',    Icon: IconRoster    },
  { to: '/game',      label: 'Game',      Icon: IconGame      },
  { to: '/plays',     label: 'Plays',     Icon: IconPlays     },
  { to: '/practice',  label: 'Practice',  Icon: IconPractice  },
  { to: '/settings',  label: 'Settings',  Icon: IconSettings  },
  { to: '/help',      label: 'Help',      Icon: IconHelp      },
];

/* ─── Component ────────────────────────────────────────────── */

export default function TabletNav() {
  const { coach, team, logout } = useAuth();
  const navigate                = useNavigate();
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuRef = useRef(null);

  // Initials from coach profile
  const initials = coach
    ? `${(coach.firstName || '')[0] || ''}${(coach.lastName || '')[0] || ''}`.toUpperCase() || 'CO'
    : '–';

  // Close avatar dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  function handleLogout() {
    logout();
    setDrawerOpen(false);
    navigate('/login', { replace: true });
  }

  function handleDrawerNav() {
    setDrawerOpen(false);
  }

  return (
    <>
      <nav className="tablet-nav" role="navigation" aria-label="Main navigation">

        {/* Brand */}
        <Link to="/dashboard" className="nav-brand" aria-label="CoachIQ — go to dashboard">
          {team?.logoUrl
            ? <TeamLogo url={team.logoUrl} name={team.teamName} />
            : <LogoMark />
          }
          <span className="nav-wordmark">
            COACH<span>IQ</span>
          </span>
        </Link>

        {/* Navigation tabs (hidden on phone) */}
        <div className="nav-tabs" role="list">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}
              role="listitem"
              aria-label={label}
            >
              <Icon />
              <span className="nav-tab-label">{label}</span>
            </NavLink>
          ))}
        </div>

        {/* Right actions — team name + coach avatar */}
        <div className="nav-actions">
          {team && (
            <span className="nav-team-label" style={{
              fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)',
              color: 'var(--color-text-subtle)', letterSpacing: '0.5px',
              maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {team.teamName}
            </span>
          )}

          {/* Avatar with dropdown (tablet+) */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <div
              className="nav-avatar"
              role="button"
              aria-label="Coach menu"
              aria-expanded={menuOpen}
              tabIndex={0}
              onClick={() => setMenuOpen(v => !v)}
              onKeyDown={e => e.key === 'Enter' && setMenuOpen(v => !v)}
            >
              {initials}
            </div>

            {menuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + var(--sp-3))', right: 0,
                background: 'var(--color-surface-1)', border: '1px solid var(--color-surface-3)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                minWidth: 180, zIndex: 200, overflow: 'hidden',
              }}>
                <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--color-surface-3)' }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                    {coach?.firstName} {coach?.lastName}
                  </p>
                  <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {coach?.email}
                  </p>
                </div>
                <button onClick={handleLogout} style={{
                  width: '100%', padding: 'var(--sp-4) var(--sp-5)', textAlign: 'left',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
                  letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-red)',
                  transition: 'background var(--ease-base)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-red-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>

          {/* Hamburger (phone only) */}
          <div
            role="button"
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            tabIndex={0}
            onClick={() => setDrawerOpen(true)}
            onKeyDown={e => e.key === 'Enter' && setDrawerOpen(true)}
            className="nav-hamburger"
          >
            <span className="nav-hamburger-bar" />
            <span className="nav-hamburger-bar" />
            <span className="nav-hamburger-bar" />
          </div>
        </div>

      </nav>

      {/* Mobile drawer */}
      <div
        className={`nav-drawer${drawerOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Drawer header */}
        <div className="nav-drawer-header">
          <Link to="/dashboard" className="nav-drawer-brand" onClick={handleDrawerNav} aria-label="CoachIQ home">
            {team?.logoUrl
              ? <TeamLogo url={team.logoUrl} name={team.teamName} />
              : <LogoMark />
            }
            <span className="nav-drawer-wordmark">COACH<span>IQ</span></span>
          </Link>
          <div
            className="nav-drawer-close"
            role="button"
            aria-label="Close menu"
            tabIndex={0}
            onClick={() => setDrawerOpen(false)}
            onKeyDown={e => e.key === 'Enter' && setDrawerOpen(false)}
          >
            ✕
          </div>
        </div>

        {/* Nav items */}
        <div className="nav-drawer-items">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-drawer-item${isActive ? ' active' : ''}`}
              onClick={handleDrawerNav}
              aria-label={label}
            >
              <span className="nav-drawer-item-icon"><Icon /></span>
              {label}
            </NavLink>
          ))}
        </div>

        {/* Footer: coach info + logout */}
        <div className="nav-drawer-footer">
          <div className="nav-drawer-coach-info">
            <p className="nav-drawer-coach-name">{coach?.firstName} {coach?.lastName}</p>
            <p className="nav-drawer-coach-email">{coach?.email}</p>
            {team && (
              <p className="nav-drawer-coach-email" style={{ marginTop: 2 }}>{team.teamName}</p>
            )}
          </div>
          <button className="nav-drawer-logout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
