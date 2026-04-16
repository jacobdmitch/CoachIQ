import React, { useReducer, useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext.js';
import FieldSVG from './FieldSVG.js';
import './PlayEditor.css';

// ─── State / reducer ─────────────────────────────────────────────────────────

const initialDiagramState = {
  format: 'half_field',
  players: [],
  arrows: [],
  text_labels: [],
  history: [],
  redoStack: [],
  selectedTool: 'select',
  arrowType: 'run',
  drawingArrow: null,
};

function diagramReducer(state, action) {
  switch (action.type) {
    case 'ADD_PLAYER': {
      const newState = { ...state, players: [...state.players, action.payload] };
      return { ...newState, history: [...state.history, newState], redoStack: [] };
    }
    case 'DRAG_PLAYER': {
      // Live drag — updates position without writing to history to avoid stack flooding
      return {
        ...state,
        players: state.players.map(p =>
          p.id === action.payload.id ? { ...p, x: action.payload.x, y: action.payload.y } : p
        ),
      };
    }
    case 'MOVE_PLAYER': {
      // Committed move (on pointer-up) — saves pre-move state to history for undo
      const newState = {
        ...state,
        players: state.players.map(p =>
          p.id === action.payload.id ? { ...p, x: action.payload.x, y: action.payload.y } : p
        ),
      };
      return { ...newState, history: [...state.history, state], redoStack: [] };
    }
    case 'REMOVE_PLAYER': {
      const newState = { ...state, players: state.players.filter(p => p.id !== action.payload) };
      return { ...newState, history: [...state.history, newState], redoStack: [] };
    }
    case 'START_ARROW':
      return { ...state, drawingArrow: { fromPlayerId: action.payload, points: [] } };
    case 'ADD_ARROW_POINT':
      if (!state.drawingArrow) return state;
      return {
        ...state,
        drawingArrow: { ...state.drawingArrow, points: [...state.drawingArrow.points, action.payload] },
      };
    case 'FINISH_ARROW': {
      if (!state.drawingArrow || state.drawingArrow.points.length === 0) {
        return { ...state, drawingArrow: null };
      }
      const newArrow = {
        id: `arr-${Date.now()}`,
        from: state.drawingArrow.fromPlayerId,
        points: state.drawingArrow.points,
        type: state.arrowType,
      };
      const newState = { ...state, arrows: [...state.arrows, newArrow], drawingArrow: null };
      return { ...newState, history: [...state.history, newState], redoStack: [] };
    }
    case 'REMOVE_ARROW': {
      const newState = { ...state, arrows: state.arrows.filter(a => a.id !== action.payload) };
      return { ...newState, history: [...state.history, newState], redoStack: [] };
    }
    case 'ADD_TEXT': {
      const newState = { ...state, text_labels: [...state.text_labels, action.payload] };
      return { ...newState, history: [...state.history, newState], redoStack: [] };
    }
    case 'REMOVE_TEXT': {
      const newState = { ...state, text_labels: state.text_labels.filter(t => t.id !== action.payload) };
      return { ...newState, history: [...state.history, newState], redoStack: [] };
    }
    case 'SET_TOOL':       return { ...state, selectedTool: action.payload };
    case 'SET_ARROW_TYPE': return { ...state, arrowType: action.payload };
    case 'SET_FORMAT':     return { ...state, format: action.payload };
    case 'UNDO': {
      if (state.history.length === 0) return state;
      const prev = state.history[state.history.length - 1];
      return {
        ...prev,
        redoStack: [...state.redoStack, {
          format: state.format, players: state.players,
          arrows: state.arrows, text_labels: state.text_labels,
        }],
        history: state.history.slice(0, -1),
      };
    }
    case 'REDO': {
      if (state.redoStack.length === 0) return state;
      const next = state.redoStack[state.redoStack.length - 1];
      return {
        ...next,
        selectedTool: state.selectedTool,
        arrowType: state.arrowType,
        history: [...state.history, next],
        redoStack: state.redoStack.slice(0, -1),
        drawingArrow: null,
      };
    }
    case 'LOAD_DIAGRAM':
      return {
        ...action.payload,
        history: [], redoStack: [],
        selectedTool: 'select', arrowType: 'run', drawingArrow: null,
      };
    default:
      return state;
  }
}

// ─── Position palette ────────────────────────────────────────────────────────

const POSITIONS = [
  { role: 'Attack',  label: 'A1',   color: '#e63946' },
  { role: 'Attack',  label: 'A2',   color: '#e63946' },
  { role: 'Attack',  label: 'A3',   color: '#e63946' },
  { role: 'Midfield',label: 'M1',   color: '#457b9d' },
  { role: 'Midfield',label: 'M2',   color: '#457b9d' },
  { role: 'Midfield',label: 'M3',   color: '#457b9d' },
  { role: 'Defense', label: 'D1',   color: '#1d6fa4' },
  { role: 'Defense', label: 'D2',   color: '#1d6fa4' },
  { role: 'Defense', label: 'D3',   color: '#1d6fa4' },
  { role: 'Goalie',  label: 'G',    color: '#c9a227' },
  { role: 'FOGO',    label: 'FOGO', color: '#a8dadc' },
];

// Fixed SVG render size — the canvas wraps in an overflow-scroll container on mobile
const SVG_W = 800;
const SVG_H = 400;

/**
 * PlayEditor — Core play diagram editor.
 * Dark CoachIQ theme. Mobile-responsive: toolbar scrolls horizontally,
 * canvas scrolls on phone, details panel stacks below on portrait.
 */
export default function PlayEditor({ play, teamId, onSave, onCancel }) {
  const toast = useToast();

  const [diagram, dispatch] = useReducer(diagramReducer, initialDiagramState, (initial) => {
    if (play?.diagram_data) {
      return {
        ...initial,
        format:      play.diagram_data.format      || 'half_field',
        players:     play.diagram_data.players     || [],
        arrows:      play.diagram_data.arrows      || [],
        text_labels: play.diagram_data.text_labels || [],
      };
    }
    return initial;
  });

  const [title,        setTitle]        = useState(play?.title         || '');
  const [situationTag, setSituationTag] = useState(play?.situation_tag || '');
  const [notes,        setNotes]        = useState(play?.notes         || '');
  const [hoveredPlayer, setHoveredPlayer] = useState(null);

  const canvasRef       = useRef(null); // attached to the container div (same size as SVG)
  const draggingRef     = useRef(null); // { playerId, lastX, lastY } during an active drag
  const playerElRefs    = useRef({});   // { playerId: <g> DOM element } for direct DOM drag updates
  const dragRafRef      = useRef(null); // requestAnimationFrame handle during drag

  // ─── Coordinate helpers ─────────────────────────────────

  const viewBoxW = diagram.format === 'full_field' ? 100 : 50;
  const viewBoxH = 40;

  /** Convert a 0-1 fraction to SVG viewBox units */
  function toSVG(fx, fy) {
    return { cx: fx * viewBoxW, cy: fy * viewBoxH };
  }

  /** Convert a pointer event position (relative to canvas div) into 0-1 fractions */
  function toFraction(clientX, clientY) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left)  / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top)   / rect.height)),
    };
  }

  // ─── Canvas interactions ────────────────────────────────

  function handleCanvasPointerDown(e) {
    // Prevent scroll-pan from interfering with arrow drawing
    if (diagram.selectedTool === 'arrow' && diagram.drawingArrow) {
      e.preventDefault();
    }
  }

  function handleCanvasClick(e) {
    if (diagram.selectedTool !== 'text') return;
    const { x, y } = toFraction(e.clientX, e.clientY);
    const text = window.prompt('Enter text label:');
    if (text?.trim()) {
      dispatch({ type: 'ADD_TEXT', payload: { id: `t-${Date.now()}`, x, y, text: text.trim() } });
    }
  }

  function handleCanvasPointerMove(e) {
    if (diagram.selectedTool === 'arrow' && diagram.drawingArrow) {
      const { x, y } = toFraction(e.clientX, e.clientY);
      dispatch({ type: 'ADD_ARROW_POINT', payload: [x, y] });
    } else if (draggingRef.current) {
      const { x, y } = toFraction(e.clientX, e.clientY);
      draggingRef.current.lastX = x;
      draggingRef.current.lastY = y;

      // Move the SVG element directly via the DOM — no React re-render during drag.
      // This eliminates the frame-by-frame jump caused by the React render cycle.
      if (dragRafRef.current === null) {
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = null;
          const drag = draggingRef.current;
          if (!drag) return;
          const el = playerElRefs.current[drag.playerId];
          if (!el) return;
          const newCx = drag.lastX * viewBoxW;
          const newCy = drag.lastY * viewBoxH;
          const circle = el.querySelector('circle');
          const text   = el.querySelector('text');
          if (circle) { circle.setAttribute('cx', newCx); circle.setAttribute('cy', newCy); }
          if (text)   { text.setAttribute('x',  newCx); text.setAttribute('y',  newCy);   }
        });
      }
    }
  }

  function handleCanvasPointerUp() {
    if (diagram.selectedTool === 'arrow' && diagram.drawingArrow) {
      dispatch({ type: 'FINISH_ARROW' });
    }
    if (draggingRef.current) {
      // Cancel any pending rAF so it doesn't fire after we commit
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      // Commit final position to React state — this triggers one re-render that
      // "bakes in" the position the DOM element is already showing
      dispatch({
        type: 'MOVE_PLAYER',
        payload: { id: draggingRef.current.playerId, x: draggingRef.current.lastX, y: draggingRef.current.lastY },
      });
      draggingRef.current = null;
    }
  }

  function handlePlayerPointerDown(e, playerId) {
    e.stopPropagation();
    if (diagram.selectedTool === 'arrow') {
      dispatch({ type: 'START_ARROW', payload: playerId });
    } else if (diagram.selectedTool === 'delete') {
      dispatch({ type: 'REMOVE_PLAYER', payload: playerId });
    } else if (diagram.selectedTool === 'select') {
      // Begin drag — capture pointer on the canvas so moves aren't lost at speed
      const player = diagram.players.find(p => p.id === playerId);
      draggingRef.current = { playerId, lastX: player?.x ?? 0.5, lastY: player?.y ?? 0.5 };
      canvasRef.current?.setPointerCapture?.(e.pointerId);
    }
  }

  // ─── Save / export ──────────────────────────────────────

  const handleExportPNG = async () => {
    try {
      const svgEl = canvasRef.current?.querySelector('svg');
      if (!svgEl) return;
      const canvas  = document.createElement('canvas');
      canvas.width  = SVG_W;
      canvas.height = SVG_H;
      const ctx     = canvas.getContext('2d');
      ctx.fillStyle = '#1a5c1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const img     = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        const link = document.createElement('a');
        link.href  = canvas.toDataURL('image/png');
        link.download = `${title || 'play'}.png`;
        link.click();
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Failed to export PNG');
    }
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast.warning('Please enter a play title');
      return;
    }
    onSave({
      title,
      situationTag: situationTag || undefined,
      notes:        notes        || undefined,
      diagramData: {
        format:      diagram.format,
        players:     diagram.players,
        arrows:      diagram.arrows,
        text_labels: diagram.text_labels,
      },
      teamId,
    });
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="play-editor">

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="editor-toolbar">

        {/* Field format */}
        <div className="editor-toolbar-group">
          {['half_field', 'full_field'].map(f => (
            <button
              key={f}
              className={`editor-btn ${diagram.format === f ? 'editor-btn-active-blue' : 'editor-btn-default'}`}
              onClick={() => dispatch({ type: 'SET_FORMAT', payload: f })}
            >
              {f === 'half_field' ? 'Half' : 'Full'}
            </button>
          ))}
        </div>

        <div className="editor-toolbar-divider" />

        {/* Player position buttons */}
        <div className="editor-toolbar-group">
          {POSITIONS.map((pos, idx) => (
            <button
              key={idx}
              className="editor-btn editor-btn-player"
              style={{ backgroundColor: pos.color }}
              onClick={() => {
                if (diagram.players.length >= 11) return;
                dispatch({
                  type: 'ADD_PLAYER',
                  payload: { id: `p-${Date.now()}-${idx}`, x: 0.5, y: 0.5, label: pos.label, role: pos.role, color: pos.color },
                });
              }}
              disabled={diagram.players.length >= 11}
              title={`Add ${pos.label}`}
            >
              {pos.label}
            </button>
          ))}
        </div>

        <div className="editor-toolbar-divider" />

        {/* Active tool */}
        <div className="editor-toolbar-group">
          {[
            { key: 'select', icon: '◆', label: 'Select' },
            { key: 'arrow',  icon: '→', label: 'Arrow'  },
            { key: 'text',   icon: 'Aa', label: 'Text'  },
            { key: 'delete', icon: '✕', label: 'Delete' },
          ].map(({ key, icon, label }) => (
            <button
              key={key}
              className={`editor-btn ${diagram.selectedTool === key ? 'editor-btn-tool-active' : 'editor-btn-tool'}`}
              onClick={() => dispatch({ type: 'SET_TOOL', payload: key })}
              title={label}
            >
              {icon}
            </button>
          ))}
        </div>

        {/* Arrow type sub-toolbar */}
        {diagram.selectedTool === 'arrow' && (
          <>
            <div className="editor-toolbar-divider" />
            <div className="editor-toolbar-group">
              {['run', 'pass', 'screen'].map(type => (
                <button
                  key={type}
                  className={`editor-btn ${diagram.arrowType === type ? 'editor-btn-arrow-active' : 'editor-btn-arrow-type'}`}
                  onClick={() => dispatch({ type: 'SET_ARROW_TYPE', payload: type })}
                >
                  {type}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="editor-toolbar-divider" />

        {/* Undo / Redo */}
        <div className="editor-toolbar-group">
          <button
            className="editor-btn editor-btn-utility"
            onClick={() => dispatch({ type: 'UNDO' })}
            disabled={diagram.history.length === 0}
            title="Undo"
          >
            ↶
          </button>
          <button
            className="editor-btn editor-btn-utility"
            onClick={() => dispatch({ type: 'REDO' })}
            disabled={diagram.redoStack.length === 0}
            title="Redo"
          >
            ↷
          </button>
        </div>

      </div>

      {/* ── Body: canvas + details ───────────────────────── */}
      <div className="editor-body">

        {/* SVG canvas (scrollable on narrow screens) */}
        <div className="editor-canvas-area">
          <div
            ref={canvasRef}
            className="editor-canvas-wrap"
            style={{ width: SVG_W, height: SVG_H, touchAction: 'none' }}
            onClickCapture={handleCanvasClick}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerLeave={handleCanvasPointerUp}
            onPointerCancel={() => { draggingRef.current = null; }}
          >
            <FieldSVG format={diagram.format} width={SVG_W} height={SVG_H}>

              {/* Players */}
              {diagram.players.map(player => {
                const { cx, cy } = toSVG(player.x, player.y);
                return (
                  <g
                    key={player.id}
                    ref={el => { if (el) playerElRefs.current[player.id] = el; else delete playerElRefs.current[player.id]; }}
                    onPointerDown={e => handlePlayerPointerDown(e, player.id)}
                    onPointerEnter={() => setHoveredPlayer(player.id)}
                    onPointerLeave={() => setHoveredPlayer(null)}
                    style={{ cursor: diagram.selectedTool === 'arrow' || diagram.selectedTool === 'delete' ? 'pointer' : 'grab' }}
                  >
                    <circle
                      cx={cx} cy={cy} r="2"
                      fill={player.color}
                      stroke={hoveredPlayer === player.id ? '#fff' : '#000'}
                      strokeWidth="0.25"
                    />
                    <text
                      x={cx} y={cy}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize="1.2" fill="#fff" fontWeight="bold"
                    >
                      {player.label}
                    </text>
                  </g>
                );
              })}

              {/* Arrows */}
              {diagram.arrows.map(arrow => {
                const player = diagram.players.find(p => p.id === arrow.from);
                if (!player) return null;
                const { cx: sx, cy: sy } = toSVG(player.x, player.y);
                const pointStr = [
                  `${sx},${sy}`,
                  ...arrow.points.map(([fx, fy]) => {
                    const { cx, cy } = toSVG(fx, fy);
                    return `${cx},${cy}`;
                  }),
                ].join(' ');
                return (
                  <polyline
                    key={arrow.id}
                    points={pointStr}
                    fill="none"
                    stroke="#fff"
                    strokeWidth="0.35"
                    strokeDasharray={
                      arrow.type === 'pass'   ? '1,0.5' :
                      arrow.type === 'screen' ? '0.3,0.3' :
                      undefined
                    }
                  />
                );
              })}

              {/* Text labels */}
              {diagram.text_labels.map(label => {
                const { cx, cy } = toSVG(label.x, label.y);
                return (
                  <g
                    key={label.id}
                    onPointerDown={() => diagram.selectedTool === 'delete' && dispatch({ type: 'REMOVE_TEXT', payload: label.id })}
                    style={{ cursor: diagram.selectedTool === 'delete' ? 'pointer' : 'default' }}
                  >
                    <text
                      x={cx} y={cy}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize="1.8" fill="#fff" fontWeight="bold"
                    >
                      {label.text}
                    </text>
                  </g>
                );
              })}

            </FieldSVG>
          </div>
        </div>

        {/* Details / save panel */}
        <div className="editor-details">

          <div>
            <label className="editor-details-label">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Play name"
            />
          </div>

          <div>
            <label className="editor-details-label">Situation</label>
            <select value={situationTag} onChange={e => setSituationTag(e.target.value)}>
              <option value="">None</option>
              <option value="emo">EMO</option>
              <option value="man_down">Man-Down</option>
              <option value="settled">Settled</option>
              <option value="transition">Transition</option>
              <option value="faceoff">Faceoff</option>
              <option value="clear">Clear</option>
              <option value="6s_set">6s Set</option>
              <option value="6s_fast_break">6s Fast Break</option>
            </select>
          </div>

          <div>
            <label className="editor-details-label">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Coaching notes, keys to success…"
            />
          </div>

          <button className="editor-save-btn editor-save-btn-primary" onClick={handleSave}>
            Save Play
          </button>

          <button className="editor-save-btn editor-save-btn-export" onClick={handleExportPNG}>
            Export PNG
          </button>

          <button className="editor-save-btn editor-save-btn-cancel" onClick={onCancel}>
            Cancel
          </button>

        </div>
      </div>
    </div>
  );
}
