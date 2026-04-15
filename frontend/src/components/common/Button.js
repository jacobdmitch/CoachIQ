import React from 'react';
import './Button.css';

/**
 * Button — branded button component.
 *
 * @param {string}   variant   - 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
 * @param {string}   size      - 'sm' | 'base' | 'lg'
 * @param {boolean}  iconOnly  - true when the button contains only an icon (square)
 * @param {boolean}  disabled
 * @param {string}   className - additional classes
 * @param {node}     children
 * @param {...*}     rest      - forwarded to <button>
 */
export default function Button({
  variant   = 'primary',
  size      = 'base',
  iconOnly  = false,
  disabled  = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    iconOnly ? 'btn-icon-only' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={classes}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
