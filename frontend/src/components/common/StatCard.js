import React from 'react';
import './StatCard.css';

/**
 * StatCard — metric display with gold accent top line.
 *
 * @param {string} label      - uppercase label (e.g. "Win Rate")
 * @param {string|number} value - primary metric
 * @param {string} unit       - optional unit suffix (e.g. "%", "pts")
 * @param {number} delta      - signed change value (positive = up, negative = down)
 * @param {string} deltaLabel - context for the delta (e.g. "vs last season")
 * @param {string} sub        - secondary context line
 * @param {node}   children   - additional content below the value row
 */
export default function StatCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  sub,
  children,
  className = '',
  ...rest
}) {
  const deltaDir =
    delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const arrow =
    delta > 0 ? '▲' : delta < 0 ? '▼' : '—';

  return (
    <div className={`stat-card ${className}`.trim()} {...rest}>

      {label && (
        <p className="stat-card-label">{label}</p>
      )}

      <p className="stat-card-value">
        {value}
        {unit && <span className="stat-card-unit">{unit}</span>}
      </p>

      {delta !== undefined && (
        <span className={`stat-card-delta ${deltaDir}`}>
          <span className="stat-card-delta-arrow" aria-hidden="true">{arrow}</span>
          {Math.abs(delta)}{unit}
          {deltaLabel && <span style={{ fontWeight: 300, marginLeft: 4 }}>{deltaLabel}</span>}
        </span>
      )}

      {sub && <p className="stat-card-sub">{sub}</p>}

      {children}
    </div>
  );
}
