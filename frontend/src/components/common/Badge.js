import React from 'react';
import './Badge.css';

/**
 * Badge — status / category pill.
 *
 * @param {string}  variant - 'gold' | 'green' | 'red' | 'amber' | 'blue' | 'gray'
 * @param {boolean} dot     - show a leading color dot
 * @param {node}    children
 */
export default function Badge({ variant = 'gold', dot = false, children, className = '', ...rest }) {
  return (
    <span
      className={`badge badge-${variant} ${className}`.trim()}
      {...rest}
    >
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
