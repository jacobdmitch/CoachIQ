import React, { useEffect, useState } from 'react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import './ProactivePushBanner.css';

/**
 * ProactivePushBanner — top-anchored banner surface for proactive Line Coach
 * recommendations during a live game.
 *
 * Behavior:
 *   - Fixed to top of viewport, sitting above page content
 *   - Slides down from top on mount, up on unmount (via push key change)
 *   - Urgency-coded border + pill: high→red, medium→amber, low→blue
 *   - Two large touch targets (Dismiss, Accept) meeting HIG 44pt min
 *   - Replace-with-newest: a new push while one is shown swaps body + key
 *     so the animation re-plays and the coach notices the change
 *
 * Props:
 *   push            - null when nothing to show, else { pushId, pushedAt,
 *                     reason, suggestion: { type, urgency, ...fields } }
 *   onAcknowledge(push) - called when coach taps Accept; full push is
 *                        forwarded so the parent can dispatch by type
 *                        (e.g., auto-execute a SUBSTITUTION).
 *   onDismiss(pushId)   - called when coach taps Dismiss
 *   resolveAthleteName  - optional (uuid) => string resolver; keeps the
 *                        banner dumb about roster lookups. Falls back to
 *                        the raw UUID when unavailable or not found.
 */
export default function ProactivePushBanner({
  push,
  onAcknowledge,
  onDismiss,
  resolveAthleteName,
}) {
  // `visible` drives the enter/exit animation. When `push` flips from null
  // to a value we mount the element and flag visible; when it flips back to
  // null we keep the element mounted briefly to play the exit transition,
  // then drop it from the DOM.
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    if (push) {
      setCurrent(push);
      // Next tick so the browser applies the initial off-screen transform
      // before we flip `visible` and trigger the transition.
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    // Keep the old payload around through the 200ms exit transition so the
    // text doesn't vanish during the slide-up.
    const timeout = setTimeout(() => setCurrent(null), 220);
    return () => clearTimeout(timeout);
  }, [push]);

  if (!current) return null;

  const { pushId, suggestion = {}, reason } = current;
  const urgency = (suggestion.urgency || 'medium').toLowerCase();
  const type    = suggestion.type || 'ALERT';

  return (
    <div
      className={[
        'ppush-banner',
        `ppush-urgency-${urgency}`,
        visible ? 'ppush-visible' : 'ppush-hidden',
      ].join(' ')}
      role="status"
      aria-live="polite"
      data-push-id={pushId}
    >
      <div className="ppush-content">
        <div className="ppush-head">
          <Badge variant={urgencyVariant(urgency)} dot>
            {urgency.toUpperCase()}
          </Badge>
          <span className="ppush-type">{labelForType(type)}</span>
          {reason && <span className="ppush-reason">{labelForReason(reason)}</span>}
        </div>
        <div className="ppush-body">{renderBody(suggestion, resolveAthleteName)}</div>
      </div>
      <div className="ppush-actions">
        <Button
          variant="ghost"
          size="lg"
          onClick={() => onDismiss?.(pushId)}
          aria-label="Dismiss recommendation"
        >
          Dismiss
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={() => onAcknowledge?.(current)}
          aria-label="Accept recommendation"
        >
          Accept
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function urgencyVariant(urgency) {
  if (urgency === 'high') return 'red';
  if (urgency === 'low')  return 'blue';
  return 'amber';
}

function labelForType(type) {
  switch (type) {
    case 'SUBSTITUTION':      return 'Substitution';
    case 'PLAYTIME_ANALYSIS': return 'Playtime';
    case 'LINEUP_EVALUATION': return 'Lineup';
    case 'POSITION_FIT':      return 'Position fit';
    case 'ALERT':             return 'Alert';
    default:                  return type;
  }
}

function labelForReason(reason) {
  switch (reason) {
    case 'timer':          return 'Periodic check';
    case 'substitution':   return 'After sub';
    case 'score':          return 'After score';
    case 'period_start':   return 'Period start';
    case 'period_end':     return 'Period end';
    case 'quarter_change': return 'Quarter change';
    case 'event':          return 'Game event';
    default:               return reason;
  }
}

// Render the suggestion payload defensively — shape varies by type, and
// we'd rather show something useful than crash on an unexpected field.
function renderBody(suggestion, resolveAthleteName) {
  const text =
    suggestion.message     ||
    suggestion.rationale   ||
    suggestion.analysis    ||
    suggestion.reason      ||
    suggestion.description ||
    suggestion.text;

  if (suggestion.type === 'SUBSTITUTION' && (suggestion.playerIn || suggestion.playerOut)) {
    // Prefer a caller-supplied resolver → any *Name field the server set
    // → the raw UUID as a last resort (at least the coach sees something).
    const resolve = (id, nameField) => {
      if (suggestion[nameField]) return suggestion[nameField];
      if (resolveAthleteName && id) return resolveAthleteName(id) || id;
      return id || '—';
    };
    return (
      <>
        <div className="ppush-sub-line">
          {resolve(suggestion.playerOut, 'playerOutName')}
          <span className="ppush-arrow" aria-hidden="true">→</span>
          {resolve(suggestion.playerIn,  'playerInName')}
        </div>
        {text && <div className="ppush-sub-reason">{text}</div>}
      </>
    );
  }

  if (text) return <div>{text}</div>;

  // Last-resort fallback so an unexpected payload still renders something.
  return <div className="ppush-fallback">Tap Accept to open details.</div>;
}
