import * as Sentry from '@sentry/react';

/**
 * Sentry wrapper — noop when REACT_APP_SENTRY_DSN is unset, so local dev
 * and any environment without credentials behaves as if Sentry weren't
 * imported at all. Safe to call at any time after module load.
 */

let enabled = false;

export function initSentry() {
  const dsn = process.env.REACT_APP_SENTRY_DSN;
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.info('Sentry disabled (no REACT_APP_SENTRY_DSN set)');
    return false;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.REACT_APP_RELEASE || undefined,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });

  enabled = true;
  return true;
}

export function captureException(err, context = {}) {
  if (!enabled) {
    // eslint-disable-next-line no-console
    console.error('[Sentry disabled]', err, context);
    return;
  }
  Sentry.withScope((scope) => {
    if (context.coachId) scope.setTag('coach_id', String(context.coachId));
    if (context.gameId)  scope.setTag('game_id', String(context.gameId));
    if (context.route)   scope.setTag('route', context.route);
    if (context.extra)   scope.setContext('extra', context.extra);
    Sentry.captureException(err);
  });
}

const sentryApi = { initSentry, captureException };
export default sentryApi;
