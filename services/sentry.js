import * as Sentry from '@sentry/node';
import logger from './logger.js';

/**
 * Sentry wrapper — safe to call even when SENTRY_DSN is unset.
 *
 * If no DSN is configured, every exported function is a noop so the app
 * runs identically in local dev and in environments without Sentry
 * credentials. This lets us ship the instrumentation now and flip it on
 * per-environment via env var, without branching in call sites.
 */

let enabled = false;

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('Sentry disabled (no SENTRY_DSN set)');
    return false;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RENDER_GIT_COMMIT || undefined,
    // Capture 10% of transactions in production, 100% otherwise. Tune when
    // beta traffic gives us a real baseline.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });

  enabled = true;
  logger.info('Sentry initialized');
  return true;
}

/**
 * captureException — report an error to Sentry with optional context.
 * Noop when Sentry is not initialized.
 */
export function captureException(err, context = {}) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag('request_id', context.requestId);
    if (context.coachId)   scope.setTag('coach_id', String(context.coachId));
    if (context.gameId)    scope.setTag('game_id', String(context.gameId));
    if (context.route)     scope.setTag('route', context.route);
    if (context.extra)     scope.setContext('extra', context.extra);
    Sentry.captureException(err);
  });
}

/**
 * expressErrorMiddleware — Express error handler that forwards unhandled
 * errors to Sentry before the app's own errorHandler runs. Returns a
 * noop middleware when Sentry is disabled so server.js can always mount it.
 */
export function expressErrorMiddleware() {
  if (!enabled) {
    return (err, req, res, next) => next(err);
  }
  return (err, req, res, next) => {
    captureException(err, {
      requestId: req.id,
      coachId:   req.coach?.id,
      route:     `${req.method} ${req.path}`,
    });
    next(err);
  };
}

export default { initSentry, captureException, expressErrorMiddleware };
