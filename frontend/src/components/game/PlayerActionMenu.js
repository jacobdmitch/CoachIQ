import React, { useEffect, useRef } from 'react';

/**
 * PlayerActionMenu — context menu that opens on long-press of a player card.
 *
 * Two modes:
 *   - Field player:  shows stat actions (Goal, Shot, GB, Turnover, etc.) and
 *                    Sub Out, which queues them for removal.
 *   - Bench player:  shows Sub In, which queues them for entry.
 *
 * Positioned absolute at the press anchor. Auto-closes on outside tap, on
 * Escape, or on selecting an action. Uses a lightweight fixed-position
 * backdrop so taps outside dismiss without blocking deeper scroll.
 *
 * Props:
 *   anchor      — { x, y } viewport coords from useLongPress
 *   athlete     — { id, first_name, last_name, jersey_number }
 *   isOnField   — boolean; true shows stats + Sub Out, false shows Sub In
 *   onLogStat   — (statType) => void, called with 'GOAL' | 'SHOT' | ... etc.
 *   onSubOut    — () => void, called when Sub Out tapped (field only)
 *   onSubIn     — () => void, called when Sub In tapped (bench only)
 *   onClose     — () => void, always called to dismiss
 */

const FIELD_ACTIONS = [
  { key: 'GOAL',        label: 'Goal',     tone: 'success' },
  { key: 'ASSIST',      label: 'Assist',   tone: 'success' },
  { key: 'SHOT',        label: 'Shot',     tone: 'neutral' },
  { key: 'GROUND_BALL', label: 'GB',       tone: 'neutral' },
  { key: 'TURNOVER',    label: 'Turnover', tone: 'warn' },
  { key: 'CAUSED_TURNOVER', label: 'Caused TO', tone: 'neutral' },
  { key: 'SAVE',        label: 'Save',     tone: 'success' },
  { key: 'PENALTY',     label: 'Penalty',  tone: 'warn' },
];

const TONE_COLORS = {
  success: 'var(--color-green, #2e7d32)',
  warn:    'var(--color-red, #c62828)',
  neutral: 'var(--color-surface-3, #2a2a2a)',
};

export default function PlayerActionMenu({
  anchor, athlete, isOnField,
  onLogStat, onSubOut, onSubIn, onClose,
}) {
  const menuRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Clamp menu position so it doesn't overflow the viewport.
  const clampedPos = clampToViewport(anchor, 280, isOnField ? 340 : 120);

  const name = `${athlete.jersey_number ? `#${athlete.jersey_number} ` : ''}${athlete.first_name ?? ''} ${athlete.last_name ?? ''}`.trim();

  return (
    <>
      {/* Backdrop — tap to dismiss */}
      <div
        onMouseDown={onClose}
        onTouchStart={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 80,
          background: 'rgba(0,0,0,0.35)',
        }}
      />

      <div
        ref={menuRef}
        role="menu"
        aria-label={`Actions for ${name}`}
        style={{
          position: 'fixed',
          top: clampedPos.y, left: clampedPos.x,
          zIndex: 81,
          width: 280,
          background: 'var(--color-surface-1, #1a1a1a)',
          border: '1px solid var(--color-surface-3, #2a2a2a)',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
          padding: 'var(--sp-3, 10px)',
          color: 'var(--color-text-primary, #f2f2f2)',
          fontFamily: 'var(--font-body, system-ui)',
        }}
      >
        {/* Header */}
        <div style={{
          fontSize: 'var(--text-sm, 14px)', fontWeight: 700,
          padding: '4px 6px 10px',
          borderBottom: '1px solid var(--color-surface-3, #2a2a2a)',
          marginBottom: 8,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {name || 'Player'}
        </div>

        {/* Actions */}
        {isOnField ? (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
            }}>
              {FIELD_ACTIONS.map(action => (
                <ActionButton
                  key={action.key}
                  label={action.label}
                  tone={action.tone}
                  onClick={() => { onLogStat(action.key); onClose(); }}
                />
              ))}
            </div>
            <div style={{ height: 1, background: 'var(--color-surface-3, #2a2a2a)', margin: '10px 0' }} />
            <ActionButton
              label="Sub Out"
              tone="warn"
              full
              onClick={() => { onSubOut(); onClose(); }}
            />
          </>
        ) : (
          <ActionButton
            label="Sub In"
            tone="success"
            full
            onClick={() => { onSubIn(); onClose(); }}
          />
        )}
      </div>
    </>
  );
}

function ActionButton({ label, tone = 'neutral', full = false, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: TONE_COLORS[tone],
        color: tone === 'neutral' ? 'var(--color-text-primary, #f2f2f2)' : '#fff',
        border: 'none',
        padding: '10px 12px',
        minHeight: 44,             // tablet-friendly hit target
        width: full ? '100%' : undefined,
        borderRadius: 'var(--radius-md, 8px)',
        fontWeight: 700,
        fontSize: 'var(--text-sm, 14px)',
        letterSpacing: '0.3px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function clampToViewport({ x, y }, width, height) {
  const margin = 12;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  let nx = x - width / 2;
  let ny = y - height - 8; // anchor above press point by default
  if (nx < margin) nx = margin;
  if (nx + width > vw - margin) nx = vw - width - margin;
  if (ny < margin) ny = y + 12; // flip below if no room above
  if (ny + height > vh - margin) ny = vh - height - margin;
  return { x: nx, y: ny };
}
