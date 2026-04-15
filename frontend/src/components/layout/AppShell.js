import React, { useState, useEffect } from 'react';
import { Outlet, useParams, useLocation, useNavigate } from 'react-router-dom';
import TabletNav from './TabletNav';
import AICoachPanel from '../ai/AICoachPanel';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../config/api';
import './AppShell.css';

/**
 * AppShell — top-level layout container.
 *
 * Structure:
 *   ┌─────────────────────┐
 *   │    TabletNav (fixed)│  ← HIG top nav, z-index: 100
 *   ├─────────────────────┤
 *   │  LiveGameBanner?    │  ← shown when a game is active and user is off the game page
 *   ├─────────────────────┤
 *   │                     │
 *   │   .app-content      │  ← padding-top: --nav-height
 *   │      <Outlet />     │
 *   │                     │
 *   └─────────────────────┘
 *   [ AI FAB — fixed bottom-right, always visible ]
 *
 * The AICoachPanel is mounted at the shell level so it persists
 * across page navigations and maintains conversation history.
 * It receives gameId from the URL params when inside a game route.
 */

function AICoachWrapper() {
  const params = useParams();
  const gameId  = params.gameId || null;
  const context = gameId
    ? `Live game · ${gameId.slice(0, 8)}…`
    : undefined;

  return <AICoachPanel gameId={gameId} context={context} />;
}

function LiveGameBanner() {
  const { team } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeGame, setActiveGame] = useState(null);

  // Poll for active game every 30s; skip the check when already on the game page
  useEffect(() => {
    if (!team?.id) return;

    const onGamePage = location.pathname.startsWith('/game/');
    if (onGamePage) {
      setActiveGame(null);
      return;
    }

    let cancelled = false;

    async function check() {
      try {
        const res = await apiClient.get('/games', { params: { teamId: team.id, status: 'active' } });
        const games = res.data.games || [];
        if (!cancelled) setActiveGame(games.length > 0 ? games[0] : null);
      } catch {
        // Silently ignore — don't surface banner errors to the user
      }
    }

    check();
    const interval = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [team?.id, location.pathname]);

  if (!activeGame) return null;

  return (
    <div
      className="live-game-banner"
      style={{
        position: 'fixed', top: 'var(--nav-height, 60px)', left: 0, right: 0, zIndex: 90,
        background: 'var(--color-gold)', padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: '#fff',
          boxShadow: '0 0 0 3px rgba(255,255,255,0.4)',
          animation: 'pulse 1.5s ease-in-out infinite',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)',
          color: '#1a1200', letterSpacing: '0.5px',
        }}>
          Game in progress — vs {activeGame.opponent}
        </span>
      </div>
      <button
        onClick={() => navigate(`/game/${activeGame.id}`)}
        style={{
          background: 'rgba(0,0,0,0.2)', border: 'none', borderRadius: 'var(--radius-sm)',
          padding: '6px 14px', cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
          letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1a1200',
        }}
      >
        Return to Game
      </button>
    </div>
  );
}

export default function AppShell() {
  return (
    <div className="app-shell">
      <TabletNav />
      <LiveGameBanner />
      <main className="app-content">
        <Outlet />
      </main>
      <AICoachWrapper />
    </div>
  );
}
