import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import AppShell from './components/layout/AppShell.js';
import LoginPage from './components/auth/LoginPage.js';
import SignupPage from './components/auth/SignupPage.js';

// Lazy-load page-level components to keep initial bundle small
const SeasonDashboard  = lazy(() => import('./components/dashboard/SeasonDashboard.js'));
const RosterList       = lazy(() => import('./components/roster/RosterList.js'));
const AthleteProfile   = lazy(() => import('./components/roster/AthleteProfile.js'));
const GameMode         = lazy(() => import('./components/game/GameMode.js'));
const GameSummary      = lazy(() => import('./components/game/GameSummary.js'));
const LinesPage        = lazy(() => import('./components/lines/LinesPage.js'));
const PlayerShareView  = lazy(() => import('./components/share/PlayerShareView.js'));
const PlayLibrary      = lazy(() => import('./components/plays/PlayLibrary.js'));
const PracticeCalendar = lazy(() => import('./components/practice/PracticeCalendar.js'));
const SettingsPage     = lazy(() => import('./components/settings/SettingsPage.js'));
const HelpPage         = lazy(() => import('./components/help/HelpPage.js'));

// Full-screen loader shown during Suspense fallback and auth check
function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100dvh',
      backgroundColor: '#0A1018',
      color: '#9CA3AF',
      fontSize: '11px',
      fontFamily: "'Nexa', 'Helvetica Neue', system-ui, -apple-system, sans-serif",
      fontWeight: 700,
      letterSpacing: '2px',
      textTransform: 'uppercase',
    }}>
      Loading…
    </div>
  );
}

/**
 * ProtectedRoute — redirects unauthenticated users to /login,
 * preserving the intended destination so they land there after auth.
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoader />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

/**
 * PublicRoute — redirects already-authenticated users away from /login.
 */
function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <Router>
        <Suspense fallback={<PageLoader />}>
          <Routes>

            {/* Public: login */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />

            {/* Public: signup */}
            <Route
              path="/signup"
              element={
                <PublicRoute>
                  <SignupPage />
                </PublicRoute>
              }
            />

            {/* Public: athlete share link (no auth) */}
            <Route path="/share/player/:token" element={<PlayerShareView />} />

            {/* Protected: all app pages inside AppShell */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"            element={<SeasonDashboard />} />
              <Route path="roster"               element={<RosterList />} />
              <Route path="roster/:athleteId"    element={<AthleteProfile />} />
              <Route path="game"                 element={<GameMode />} />
              <Route path="game/:gameId"         element={<GameMode />} />
              <Route path="game/:gameId/summary" element={<GameSummary />} />
              <Route path="lines"                element={<LinesPage />} />
              <Route path="plays"                element={<PlayLibrary />} />
              <Route path="practice"             element={<PracticeCalendar />} />
              <Route path="settings"             element={<SettingsPage />} />
              <Route path="help"                element={<HelpPage />} />
            </Route>

            {/* Catch-all → dashboard (or login if not authed) */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />

          </Routes>
        </Suspense>
      </Router>
      </ToastProvider>
    </AuthProvider>
  );
}
