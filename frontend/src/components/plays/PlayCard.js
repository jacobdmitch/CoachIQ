import React, { useState } from 'react';
import FieldSVG from './FieldSVG.js';

const SITUATION_COLORS = {
  emo: '#22c55e',
  man_down: '#ef4444',
  settled: '#3b82f6',
  transition: '#f59e0b',
  faceoff: '#8b5cf6',
  clear: '#06b6d4',
  '6s_set': '#ec4899',
  '6s_fast_break': '#f97316',
};

const SITUATION_LABELS = {
  emo: 'EMO',
  man_down: 'Man-Down',
  settled: 'Settled',
  transition: 'Transition',
  faceoff: 'Faceoff',
  clear: 'Clear',
  '6s_set': '6s Set',
  '6s_fast_break': '6s Fast Break',
};

/**
 * PlayCard - Small reusable card for play library grid
 */
export default function PlayCard({ play, onEdit, onDuplicate, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);

  const format = play.diagram_data?.format || 'half_field';

  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s',
      }}
      onClick={() => onEdit(play)}
    >
      {/* Mini field diagram */}
      <div style={{ position: 'relative', height: '120px', backgroundColor: '#f5f5f5' }}>
        <FieldSVG format={format} width="100%" height="120" />
      </div>

      {/* Card content */}
      <div style={{ padding: '12px' }}>
        {/* Title and menu */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <h3 style={{ margin: '0', fontSize: '14px', fontWeight: '600', flex: 1 }}>{play.title}</h3>
          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              ⋯
            </button>

            {showMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '28px',
                  right: '0',
                  backgroundColor: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 10,
                  minWidth: '120px',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(play);
                    setShowMenu(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Duplicate
                </button>
                <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid #eee' }} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(play);
                    setShowMenu(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#ef4444',
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Situation tag badge */}
        {play.situation_tag && (
          <div style={{ marginBottom: '8px' }}>
            <span
              style={{
                display: 'inline-block',
                backgroundColor: SITUATION_COLORS[play.situation_tag] || '#999',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '600',
              }}
            >
              {SITUATION_LABELS[play.situation_tag] || play.situation_tag}
            </span>
          </div>
        )}

        {/* Notes preview */}
        {play.notes && (
          <p style={{ margin: '0', fontSize: '12px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {play.notes}
          </p>
        )}
      </div>
    </div>
  );
}

export default PlayCard;
