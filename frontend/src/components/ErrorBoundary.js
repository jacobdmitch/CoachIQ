import React from 'react';
import { captureException } from '../services/sentry';

/**
 * ErrorBoundary — catches render-phase exceptions in the React tree and
 * shows a minimal recovery UI instead of a white screen. On the sideline
 * this matters: an unhandled error mid-game should not wipe the screen
 * with no path back.
 *
 * Errors are forwarded to Sentry (noop when DSN unset). The user gets a
 * reload button, which is the cheapest thing that resets state to a known
 * good point — local state is lost but persisted game state rehydrates
 * from the server on reconnect.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    captureException(error, { extra: { componentStack: info?.componentStack } });
    // Also log to console so the coach can screenshot it during beta.
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  // Reset the boundary and re-render the tree WITHOUT a full reload, so an
  // in-progress game (clock, scores, staged subs) stays intact in memory.
  // Reload is the fallback only if the error immediately recurs.
  handleRecover = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100dvh',
        padding: '24px',
        backgroundColor: '#0A1018',
        color: '#E5E7EB',
        fontFamily: "'Nexa', 'Helvetica Neue', system-ui, -apple-system, sans-serif",
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '20px',
          fontWeight: 700,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: '#C9A227',
          marginBottom: '12px',
        }}>
          Something broke
        </h1>
        <p style={{ fontSize: '14px', color: '#9CA3AF', maxWidth: '420px', marginBottom: '24px' }}>
          CoachIQ hit an unexpected error. Tap "Try again" to recover without
          interrupting your live game — it's saved on this device. Use Reload
          only if that doesn't work.
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={this.handleRecover}
            style={{
              padding: '10px 24px',
              backgroundColor: '#C9A227',
              color: '#0A1018',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 24px',
              backgroundColor: 'transparent',
              color: '#9CA3AF',
              border: '1px solid #374151',
              borderRadius: '6px',
              fontWeight: 700,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
        {process.env.NODE_ENV !== 'production' && (
          <pre style={{
            marginTop: '24px',
            fontSize: '11px',
            color: '#6B7280',
            maxWidth: '600px',
            overflow: 'auto',
            textAlign: 'left',
          }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        )}
      </div>
    );
  }
}
