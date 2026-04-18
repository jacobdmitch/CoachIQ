import { useCallback, useRef } from 'react';

/**
 * useLongPress — attach long-press handling to any element.
 *
 * Returns event handlers that, when spread onto an element, trigger
 * `onLongPress(event)` after holding for `delay` ms. A short tap still fires
 * `onClick` if provided.
 *
 * Tablet-first: uses touchstart/touchend for iOS/Android and mousedown/up for
 * desktop testing. Cancels on pointermove > threshold so a scroll gesture
 * doesn't register as a long press.
 *
 * @param {Function} onLongPress - fired after delay ms while pressed
 * @param {Object}   opts
 * @param {Function} [opts.onClick]    - fired on a short tap (not fired if long press triggered)
 * @param {number}   [opts.delay=450]  - ms before onLongPress fires
 * @param {number}   [opts.moveThreshold=10] - pixels of movement that cancel the press
 */
export function useLongPress(onLongPress, { onClick, delay = 450, moveThreshold = 10 } = {}) {
  const timerRef     = useRef(null);
  const triggeredRef = useRef(false);
  const startRef     = useRef({ x: 0, y: 0 });

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback((e) => {
    triggeredRef.current = false;
    const point = e.touches ? e.touches[0] : e;
    startRef.current = { x: point.clientX ?? 0, y: point.clientY ?? 0 };
    // Stash coords for onLongPress so the menu can anchor to the press point
    const anchor = { x: startRef.current.x, y: startRef.current.y };
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      onLongPress({ anchor, originalEvent: e });
    }, delay);
  }, [onLongPress, delay]);

  const move = useCallback((e) => {
    if (!timerRef.current) return;
    const point = e.touches ? e.touches[0] : e;
    const dx = (point.clientX ?? 0) - startRef.current.x;
    const dy = (point.clientY ?? 0) - startRef.current.y;
    if (Math.hypot(dx, dy) > moveThreshold) clear();
  }, [clear, moveThreshold]);

  const end = useCallback((e) => {
    clear();
    if (!triggeredRef.current && onClick) onClick(e);
  }, [clear, onClick]);

  const cancel = useCallback(() => clear(), [clear]);

  return {
    onTouchStart:  start,
    onTouchMove:   move,
    onTouchEnd:    end,
    onTouchCancel: cancel,
    onMouseDown:   start,
    onMouseMove:   move,
    onMouseUp:     end,
    onMouseLeave:  cancel,
    // Block the browser's native "hold to select" menu on long press.
    onContextMenu: (e) => e.preventDefault(),
  };
}

export default useLongPress;
