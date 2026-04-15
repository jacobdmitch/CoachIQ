import React, { useReducer, useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext.js';
import FieldSVG from './FieldSVG.js';

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
      const newState = {
        ...state,
        players: [...state.players, action.payload],
      };
      return {
        ...newState,
        history: [...state.history, newState],
        redoStack: [],
      };
    }

    case 'MOVE_PLAYER': {
      const newState = {
        ...state,
        players: state.players.map((p) =>
          p.id === action.payload.id ? { ...p, x: action.payload.x, y: action.payload.y } : p
        ),
      };
      return {
        ...newState,
        history: [...state.history, newState],
        redoStack: [],
      };
    }

    case 'REMOVE_PLAYER': {
      const newState = {
        ...state,
        players: state.players.filter((p) => p.id !== action.payload),
      };
      return {
        ...newState,
        history: [...state.history, newState],
        redoStack: [],
      };
    }

    case 'START_ARROW': {
      return {
        ...state,
        drawingArrow: { fromPlayerId: action.payload, points: [] },
      };
    }

    case 'ADD_ARROW_POINT': {
      if (!state.drawingArrow) return state;
      return {
        ...state,
        drawingArrow: {
          ...state.drawingArrow,
          points: [...state.drawingArrow.points, action.payload],
        },
      };
    }

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

      const newState = {
        ...state,
        arrows: [...state.arrows, newArrow],
        drawingArrow: null,
      };

      return {
        ...newState,
        history: [...state.history, newState],
        redoStack: [],
      };
    }

    case 'REMOVE_ARROW': {
      const newState = {
        ...state,
        arrows: state.arrows.filter((a) => a.id !== action.payload),
      };
      return {
        ...newState,
        history: [...state.history, newState],
        redoStack: [],
      };
    }

    case 'ADD_TEXT': {
      const newState = {
        ...state,
        text_labels: [...state.text_labels, action.payload],
      };
      return {
        ...newState,
        history: [...state.history, newState],
        redoStack: [],
      };
    }

    case 'REMOVE_TEXT': {
      const newState = {
        ...state,
        text_labels: state.text_labels.filter((t) => t.id !== action.payload),
      };
      return {
        ...newState,
        history: [...state.history, newState],
        redoStack: [],
      };
    }

    case 'SET_TOOL':
      return { ...state, selectedTool: action.payload };

    case 'SET_ARROW_TYPE':
      return { ...state, arrowType: action.payload };

    case 'SET_FORMAT':
      return { ...state, format: action.payload };

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const previousState = state.history[state.history.length - 1];
      return {
        ...previousState,
        redoStack: [
          ...state.redoStack,
          {
            format: state.format,
            players: state.players,
            arrows: state.arrows,
            text_labels: state.text_labels,
          },
        ],
        history: state.history.slice(0, -1),
      };
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state;
      const nextState = state.redoStack[state.redoStack.length - 1];
      return {
        ...nextState,
        selectedTool: state.selectedTool,
        arrowType: state.arrowType,
        history: [...state.history, nextState],
        redoStack: state.redoStack.slice(0, -1),
        drawingArrow: null,
      };
    }

    case 'LOAD_DIAGRAM':
      return {
        ...action.payload,
        history: [],
        redoStack: [],
        selectedTool: 'select',
        arrowType: 'run',
        drawingArrow: null,
      };

    default:
      return state;
  }
}

/**
 * PlayEditor - Core play diagram editor component
 * Manages SVG canvas, toolbar, and save panel
 */
export default function PlayEditor({ play, teamId, onSave, onCancel }) {
  const toast = useToast();
  const [diagram, dispatch] = useReducer(diagramReducer, initialDiagramState, (initial) => {
    if (play && play.diagram_data) {
      return {
        ...initial,
        format: play.diagram_data.format || 'half_field',
        players: play.diagram_data.players || [],
        arrows: play.diagram_data.arrows || [],
        text_labels: play.diagram_data.text_labels || [],
      };
    }
    return initial;
  });

  const [title, setTitle] = useState(play?.title || '');
  const [situationTag, setSituationTag] = useState(play?.situation_tag || '');
  const [notes, setNotes] = useState(play?.notes || '');
  const canvasRef = useRef(null);
  const [hoveredPlayer, setHoveredPlayer] = useState(null);

  const POSITIONS = [
    { role: 'Attack', label: 'A1', color: '#e63946' },
    { role: 'Attack', label: 'A2', color: '#e63946' },
    { role: 'Attack', label: 'A3', color: '#e63946' },
    { role: 'Midfield', label: 'M1', color: '#457b9d' },
    { role: 'Midfield', label: 'M2', color: '#457b9d' },
    { role: 'Midfield', label: 'M3', color: '#457b9d' },
    { role: 'Defense', label: 'D1', color: '#1d3557' },
    { role: 'Defense', label: 'D2', color: '#1d3557' },
    { role: 'Defense', label: 'D3', color: '#1d3557' },
    { role: 'Goalie', label: 'G', color: '#f1faee' },
    { role: 'FOGO', label: 'FOGO', color: '#a8dadc' },
  ];

  const addPlayer = (position) => {
    if (diagram.players.length >= 11) return;
    dispatch({
      type: 'ADD_PLAYER',
      payload: {
        id: `p-${Date.now()}`,
        x: 0.5,
        y: 0.5,
        label: position.label,
        role: position.role,
        color: position.color,
      },
    });
  };

  const handleCanvasClick = (e) => {
    if (diagram.selectedTool === 'select') return;

    const svg = canvasRef.current;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width);
    const y = ((e.clientY - rect.top) / rect.height);

    if (diagram.selectedTool === 'text') {
      const text = prompt('Enter text label:');
      if (text) {
        dispatch({
          type: 'ADD_TEXT',
          payload: {
            id: `t-${Date.now()}`,
            x,
            y,
            text,
          },
        });
      }
    }
  };

  const handlePlayerMouseDown = (playerId) => {
    if (diagram.selectedTool === 'arrow') {
      dispatch({ type: 'START_ARROW', payload: playerId });
    } else if (diagram.selectedTool === 'delete') {
      dispatch({ type: 'REMOVE_PLAYER', payload: playerId });
    }
  };

  // eslint-disable-next-line no-unused-vars
  const handleCanvasMouseMove = (e) => {
    if (diagram.selectedTool === 'arrow' && diagram.drawingArrow) {
      const svg = canvasRef.current;
      const rect = svg.getBoundingClientRect();
      // Coordinates for future arrow preview rendering
      void ((e.clientX - rect.left) / rect.width);
      void ((e.clientY - rect.top) / rect.height);
    }
  };

  const handleCanvasMouseUp = () => {
    if (diagram.selectedTool === 'arrow' && diagram.drawingArrow) {
      dispatch({ type: 'FINISH_ARROW' });
    }
  };

  const handleExportPNG = async () => {
    try {
      const svg = canvasRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');

      // Fill background
      ctx.fillStyle = '#1a5c1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render SVG to canvas
      const svgData = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);

        // Trigger download
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${title || 'play'}.png`;
        link.click();
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Failed to export PNG');
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.warning('Please enter a play title');
      return;
    }

    const playData = {
      title,
      situationTag: situationTag || undefined,
      notes: notes || undefined,
      diagramData: {
        format: diagram.format,
        players: diagram.players,
        arrows: diagram.arrows,
        text_labels: diagram.text_labels,
      },
      teamId,
    };

    onSave(playData);
  };

  // Normalize coordinates based on SVG dimensions
  const svgWidth = 800;
  const svgHeight = 400;

  const viewBoxWidth = diagram.format === 'full_field' ? 100 : 50;
  const scaleX = svgWidth / viewBoxWidth;
  const scaleY = svgHeight / 40;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f9f9f9' }}>
      {/* Toolbar */}
      <div style={{ padding: '12px', backgroundColor: '#fff', borderBottom: '1px solid #ddd', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => dispatch({ type: 'SET_FORMAT', payload: 'half_field' })}
            style={{
              padding: '6px 12px',
              backgroundColor: diagram.format === 'half_field' ? '#3b82f6' : '#e5e7eb',
              color: diagram.format === 'half_field' ? '#fff' : '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              minHeight: '44px',
            }}
          >
            Half Field
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_FORMAT', payload: 'full_field' })}
            style={{
              padding: '6px 12px',
              backgroundColor: diagram.format === 'full_field' ? '#3b82f6' : '#e5e7eb',
              color: diagram.format === 'full_field' ? '#fff' : '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              minHeight: '44px',
            }}
          >
            Full Field
          </button>
        </div>

        <div style={{ width: '1px', height: '24px', backgroundColor: '#ddd' }} />

        {/* Add player buttons */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {POSITIONS.map((pos, idx) => (
            <button
              key={idx}
              onClick={() => addPlayer(pos)}
              disabled={diagram.players.length >= 11}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                backgroundColor: pos.color,
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: diagram.players.length >= 11 ? 'not-allowed' : 'pointer',
                opacity: diagram.players.length >= 11 ? 0.5 : 1,
                minHeight: '44px',
                fontWeight: '600',
              }}
            >
              {pos.label}
            </button>
          ))}
        </div>

        <div style={{ width: '1px', height: '24px', backgroundColor: '#ddd' }} />

        {/* Tool buttons */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {['select', 'arrow', 'text', 'delete'].map((tool) => (
            <button
              key={tool}
              onClick={() => {
                dispatch({ type: 'SET_TOOL', payload: tool });
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: diagram.selectedTool === tool ? '#8b5cf6' : '#e5e7eb',
                color: diagram.selectedTool === tool ? '#fff' : '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                minHeight: '44px',
                textTransform: 'capitalize',
              }}
            >
              {tool === 'arrow' ? '→' : tool === 'text' ? 'Aa' : tool === 'delete' ? '✕' : '◆'}
            </button>
          ))}
        </div>

        {diagram.selectedTool === 'arrow' && (
          <>
            <div style={{ width: '1px', height: '24px', backgroundColor: '#ddd' }} />
            <div style={{ display: 'flex', gap: '6px' }}>
              {['run', 'pass', 'screen'].map((type) => (
                <button
                  key={type}
                  onClick={() => dispatch({ type: 'SET_ARROW_TYPE', payload: type })}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: diagram.arrowType === type ? '#f59e0b' : '#e5e7eb',
                    color: diagram.arrowType === type ? '#fff' : '#000',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                    minHeight: '44px',
                    textTransform: 'capitalize',
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ width: '1px', height: '24px', backgroundColor: '#ddd' }} />

        {/* Undo/Redo */}
        <button
          onClick={() => dispatch({ type: 'UNDO' })}
          disabled={diagram.history.length === 0}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            backgroundColor: '#e5e7eb',
            border: 'none',
            borderRadius: '4px',
            cursor: diagram.history.length === 0 ? 'not-allowed' : 'pointer',
            opacity: diagram.history.length === 0 ? 0.5 : 1,
            minHeight: '44px',
          }}
        >
          ↶ Undo
        </button>
        <button
          onClick={() => dispatch({ type: 'REDO' })}
          disabled={diagram.redoStack.length === 0}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            backgroundColor: '#e5e7eb',
            border: 'none',
            borderRadius: '4px',
            cursor: diagram.redoStack.length === 0 ? 'not-allowed' : 'pointer',
            opacity: diagram.redoStack.length === 0 ? 0.5 : 1,
            minHeight: '44px',
          }}
        >
          ↷ Redo
        </button>
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, display: 'flex', padding: '16px', gap: '16px', overflow: 'auto' }}>
        {/* Main canvas */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #ddd' }}>
          <div
            ref={canvasRef}
            onClickCapture={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            style={{ position: 'relative' }}
          >
            <FieldSVG format={diagram.format} width={svgWidth} height={svgHeight}>
              {/* Players */}
              {diagram.players.map((player) => (
                <g
                  key={player.id}
                  onMouseDown={() => handlePlayerMouseDown(player.id)}
                  onMouseEnter={() => setHoveredPlayer(player.id)}
                  onMouseLeave={() => setHoveredPlayer(null)}
                  style={{ cursor: diagram.selectedTool === 'arrow' || diagram.selectedTool === 'delete' ? 'pointer' : 'grab' }}
                >
                  <circle
                    cx={player.x * scaleX * (diagram.format === 'full_field' ? 100 : 50) / (diagram.format === 'full_field' ? 100 : 50)}
                    cy={player.y * scaleY}
                    r="2"
                    fill={player.color}
                    stroke={hoveredPlayer === player.id ? '#fff' : '#000'}
                    strokeWidth="0.2"
                  />
                  <text
                    x={player.x * scaleX * (diagram.format === 'full_field' ? 100 : 50) / (diagram.format === 'full_field' ? 100 : 50)}
                    y={player.y * scaleY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="1"
                    fill="#fff"
                    fontWeight="bold"
                  >
                    {player.label}
                  </text>
                </g>
              ))}

              {/* Arrows */}
              {diagram.arrows.map((arrow) => {
                const player = diagram.players.find((p) => p.id === arrow.from);
                if (!player) return null;

                const startX = player.x * scaleX * (diagram.format === 'full_field' ? 100 : 50) / (diagram.format === 'full_field' ? 100 : 50);
                const startY = player.y * scaleY;

                return (
                  <g key={arrow.id}>
                    <polyline
                      points={[
                        `${startX},${startY}`,
                        ...arrow.points.map((p) => `${p[0] * scaleX * (diagram.format === 'full_field' ? 100 : 50) / (diagram.format === 'full_field' ? 100 : 50)},${p[1] * scaleY}`),
                      ].join(' ')}
                      fill="none"
                      stroke="#fff"
                      strokeWidth="0.3"
                      strokeDasharray={arrow.type === 'pass' ? '1,0.5' : arrow.type === 'screen' ? '0.3,0.3' : 'none'}
                    />
                  </g>
                );
              })}

              {/* Text labels */}
              {diagram.text_labels.map((label) => (
                <g key={label.id} onMouseDown={() => diagram.selectedTool === 'delete' && dispatch({ type: 'REMOVE_TEXT', payload: label.id })}>
                  <text
                    x={label.x * scaleX * (diagram.format === 'full_field' ? 100 : 50) / (diagram.format === 'full_field' ? 100 : 50)}
                    y={label.y * scaleY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="1.5"
                    fill="#fff"
                    fontWeight="bold"
                  >
                    {label.text}
                  </text>
                </g>
              ))}
            </FieldSVG>
          </div>
        </div>

        {/* Save panel */}
        <div style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter play title"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
              Situation Tag
            </label>
            <select
              value={situationTag}
              onChange={(e) => setSituationTag(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            >
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
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add play notes..."
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '13px',
                boxSizing: 'border-box',
                minHeight: '80px',
                resize: 'vertical',
              }}
            />
          </div>

          <button
            onClick={handleExportPNG}
            style={{
              padding: '8px',
              backgroundColor: '#06b6d4',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              minHeight: '44px',
            }}
          >
            Export PNG
          </button>

          <button
            onClick={handleSave}
            style={{
              padding: '8px',
              backgroundColor: '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              minHeight: '44px',
            }}
          >
            Save Play
          </button>

          <button
            onClick={onCancel}
            style={{
              padding: '8px',
              backgroundColor: '#e5e7eb',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              minHeight: '44px',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
