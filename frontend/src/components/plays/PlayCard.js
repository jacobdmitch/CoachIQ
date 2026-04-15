import React, { useState, useRef, useEffect } from 'react';
import FieldSVG from './FieldSVG.js';

const SITUATION_COLORS = {
  emo:           '#22c55e',
  man_down:      '#ef4444',
  settled:       '#3b82f6',
  transition:    '#f59e0b',
  faceoff:       '#8b5cf6',
  clear:         '#06b6d4',
  '6s_set':      '#ec4899',
  '6s_fast_break':'#f97316',
};

const SITUATION_LABELS = {
  emo:           'EMO',
  man_down:      'Man-Down',
  settled:       'Settled',
  transition:    'Transition',
  faceoff:       'Faceoff',
  clear:         'Clear',
  '6s_set':      '6s Set',
  '6s_fast_break':'6s Fast Break',
};

/**
 * PlayCard — Dark-themed card for the play library grid.
 * Touch-friendly: 44pt minimum tap targets, pointer events for mouse + touch.
 */
export default function PlayCard({ play, onEdit, onDuplicate, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  const format = play.diagram_data?.format || 'half_field';
  const situationColor = SITUATION_COLORS[play.situation_tag];

  // Close dropdown when tapping outside
  useEffect(() => {
    function handlePointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showMenu]);

  return (
    <div
      style={{
        background: 'var(--color-surface-0)',
        border: '1px solid var(--color-surface-3)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color var(--ease-base), box-shadow var(--ease-base)',
        position: 'relative',
      }}
      onClick={() => onEdit(play)}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--color-gold-border)';
        e.currentTarget.style.boxShadow = 'var(--shadow-gold)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--color-surface-3)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Situation color accent bar */}
      {situationColor && (
        <div style={{
          height: 3,
          background: situationColor,
          width: '100%',
        }} />
      )}

      {/* Mini field diagram */}
      <div style={{
        position: 'relative',
        height: 130,
        background: '#1a5c1a',
        overflow: 'hidden',
      }}>
        <FieldSVG format={format} width="100%" height="130" />
        {/* Dim overlay so it reads as a thumbnail */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, transparent 60%, rgba(17,24,39,0.6) 100%)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Card content */}
      <div style={{ padding: 'var(--sp-4)' }}>

        {/* Title row + kebab menu */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--sp-2)',
          marginBottom: 'var(--sp-3)',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'var(--text-sm)',
            letterSpacing: '0.5px',
            color: 'var(--color-text-primary)',
            margin: 0,
            flex: 1,
            lineHeight: 'var(--leading-snug)',
          }}>
            {play.title}
          </h3>

          {/* Kebab menu */}
          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={e => { e.stopPropagation(); setShowMenu(v => !v); }}
              aria-label="Play options"
              style={{
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-muted)',
                fontSize: 18,
                cursor: 'pointer',
                transition: 'background var(--ease-base)',
                letterSpacing: '1px',
                /* Expand touch target */
                padding: 'var(--sp-1)',
                margin: '-4px -4px 0 0',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              ⋯
            </button>

            {showMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  background: 'var(--color-surface-1)',
                  border: '1px solid var(--color-surface-3)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 20,
                  minWidth: 140,
                  overflow: 'hidden',
                }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={e => { e.stopPropagation(); onDuplicate(play); setShowMenu(false); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: 'var(--sp-3) var(--sp-4)',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 700,
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-secondary)',
                    minHeight: 44,
                    transition: 'background var(--ease-base)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  Duplicate
                </button>
                <div style={{ height: 1, background: 'var(--color-surface-3)' }} />
                <button
                  onClick={e => { e.stopPropagation(); onDelete(play); setShowMenu(false); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: 'var(--sp-3) var(--sp-4)',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 700,
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    color: 'var(--color-red)',
                    minHeight: 44,
                    transition: 'background var(--ease-base)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-red-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Situation tag */}
        {play.situation_tag && (
          <div style={{ marginBottom: 'var(--sp-2)' }}>
            <span style={{
              display: 'inline-block',
              background: situationColor ? `${situationColor}22` : 'var(--color-surface-2)',
              color: situationColor || 'var(--color-text-muted)',
              border: `1px solid ${situationColor ? `${situationColor}44` : 'var(--color-surface-3)'}`,
              padding: '2px 10px',
              borderRadius: 'var(--radius-full)',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: 'var(--text-xs)',
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}>
              {SITUATION_LABELS[play.situation_tag] || play.situation_tag}
            </span>
          </div>
        )}

        {/* Notes preview */}
        {play.notes && (
          <p style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '0.3px',
          }}>
            {play.notes}
          </p>
        )}
      </div>
    </div>
  );
}
