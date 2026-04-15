import React from 'react';
import { Outlet, useParams } from 'react-router-dom';
import TabletNav from './TabletNav';
import AICoachPanel from '../ai/AICoachPanel';
import './AppShell.css';

/**
 * AppShell — top-level layout container.
 *
 * Structure:
 *   ┌─────────────────────┐
 *   │    TabletNav (fixed)│  ← HIG top nav, z-index: 100
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
  // gameId is present on /game/:gameId routes
  const gameId  = params.gameId   || null;
  const context = gameId
    ? `Live game · ${gameId.slice(0, 8)}…`
    : undefined;

  return <AICoachPanel gameId={gameId} context={context} />;
}

export default function AppShell() {
  return (
    <div className="app-shell">
      <TabletNav />
      <main className="app-content">
        <Outlet />
      </main>
      <AICoachWrapper />
    </div>
  );
}
