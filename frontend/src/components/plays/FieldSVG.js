import React from 'react';

/**
 * FieldSVG - Renders a lacrosse field (half or full) as SVG
 * All field elements use normalized coordinates (0-1) mapped to pixel dimensions
 */
export default function FieldSVG({ format = 'half_field', width = 800, height = 400, children }) {
  const viewBoxWidth = format === 'full_field' ? 100 : 50;
  const viewBoxHeight = 40;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      style={{ border: '2px solid #333', backgroundColor: '#1a5c1a' }}
    >
      {/* Field background */}
      <rect width={viewBoxWidth} height={viewBoxHeight} fill="#1a5c1a" />

      {/* Boundary lines */}
      <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="none" stroke="#fff" strokeWidth="0.3" />

      {format === 'full_field' ? (
        <>
          {/* Full field layout */}
          {/* Midfield line */}
          <line x1="50" y1="0" x2="50" y2={viewBoxHeight} stroke="#fff" strokeWidth="0.3" strokeDasharray="0.5,0.5" />
          {/* Center X (faceoff spot) */}
          <circle cx="50" cy="20" r="0.3" fill="none" stroke="#fff" strokeWidth="0.15" />

          {/* Left side: Attack zone, restraining line, and crease */}
          <line x1="20" y1="0" x2="20" y2={viewBoxHeight} stroke="#fff" strokeWidth="0.2" />
          <circle cx="10" cy="20" r="6" fill="none" stroke="#fff" strokeWidth="0.2" />
          <line x1="10" y1="14" x2="10" y2="26" stroke="#fff" strokeWidth="0.15" />

          {/* Right side: Attack zone, restraining line, and crease */}
          <line x1="80" y1="0" x2="80" y2={viewBoxHeight} stroke="#fff" strokeWidth="0.2" />
          <circle cx="90" cy="20" r="6" fill="none" stroke="#fff" strokeWidth="0.2" />
          <line x1="90" y1="14" x2="90" y2="26" stroke="#fff" strokeWidth="0.15" />
        </>
      ) : (
        <>
          {/* Half field layout */}
          {/* Restraining line at x=20 (from one end) */}
          <line x1="20" y1="0" x2="20" y2={viewBoxHeight} stroke="#fff" strokeWidth="0.2" />

          {/* Crease (6-yard circle) centered at x=10, y=20 */}
          <circle cx="10" cy="20" r="6" fill="none" stroke="#fff" strokeWidth="0.2" />
          <line x1="10" y1="14" x2="10" y2="26" stroke="#fff" strokeWidth="0.15" />

          {/* Attack box area (roughed in) */}
          <rect x="0" y="8" width="25" height="24" fill="none" stroke="#fff" strokeWidth="0.1" opacity="0.3" />

          {/* Faceoff X at center (around x=30-35, y=20) */}
          <circle cx="35" cy="20" r="0.3" fill="none" stroke="#fff" strokeWidth="0.15" />
        </>
      )}

      {/* Goal line marker */}
      {format === 'full_field' && (
        <>
          <line x1="0" y1="0" x2="0" y2={viewBoxHeight} stroke="#ff6b6b" strokeWidth="0.3" />
          <line x1="100" y1="0" x2="100" y2={viewBoxHeight} stroke="#ff6b6b" strokeWidth="0.3" />
        </>
      )}
      {format === 'half_field' && (
        <line x1="0" y1="0" x2="0" y2={viewBoxHeight} stroke="#ff6b6b" strokeWidth="0.3" />
      )}

      {/* Sideline markings (optional, subtle) */}
      {[8, 16, 24, 32].map((y) => (
        <circle key={`sideline-${y}`} cx="0.5" cy={y} r="0.15" fill="#fff" opacity="0.5" />
      ))}

      {/* Render children (players, arrows, text labels) on top */}
      {children}
    </svg>
  );
}

export default FieldSVG;
