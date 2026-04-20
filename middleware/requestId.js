import crypto from 'crypto';

/**
 * requestId middleware — attaches a short random ID to every request so we
 * can trace a single call through the logs. Also writes the ID to the
 * `X-Request-Id` response header so clients can report it when something
 * goes wrong.
 *
 * Kept intentionally simple: 10 hex chars is enough entropy for a
 * small-volume beta. Swap for ULID/UUID only if log volume demands it.
 */
export default function requestId(req, res, next) {
  // Respect an inbound X-Request-Id (e.g., from a load balancer or browser
  // retry) so the same logical request stays linkable across hops.
  const inbound = req.headers['x-request-id'];
  req.id = typeof inbound === 'string' && /^[A-Za-z0-9-]{4,64}$/.test(inbound)
    ? inbound
    : crypto.randomBytes(5).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  next();
}
