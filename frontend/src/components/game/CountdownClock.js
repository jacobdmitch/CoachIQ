import React, { useEffect, useRef, useState } from 'react';

/**
 * CountdownClock — a single named countdown (e.g. Clear, Stall, Shot Clock).
 *
 * Handles its own 1 Hz tick, start/pause/reset, visual urgency states
 * (warning under 10 s, expired at 0), and an audible chirp on expiry via
 * the Web Audio API. No server round-trip — secondary clocks live entirely
 * on the sideline device, so the coach can start/reset them with a tap.
 *
 * Props:
 *   - label           Display label ("Clear", "Stall", "Shot Clock", …)
 *   - initialSeconds  Starting duration in seconds
 *   - warnAt          Seconds remaining at which to visually warn (default 10)
 *   - onExpire        Optional callback fired once when the clock hits 0
 *   - compact         If true, reduces padding for dense layouts
 */
export default function CountdownClock({
  label,
  initialSeconds,
  warnAt = 10,
  onExpire,
  compact = false,
}) {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [running, setRunning]   = useState(false);
  const intervalRef             = useRef(null);
  const expiredRef              = useRef(false);

  // Reset on duration change (e.g., rule-config change)
  useEffect(() => {
    setTimeLeft(initialSeconds);
    expiredRef.current = false;
  }, [initialSeconds]);

  useEffect(() => {
    if (!running) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          if (!expiredRef.current) {
            expiredRef.current = true;
            playChirp();
            if (onExpire) onExpire();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, onExpire]);

  function reset() {
    clearInterval(intervalRef.current);
    setRunning(false);
    setTimeLeft(initialSeconds);
    expiredRef.current = false;
  }

  const expired = timeLeft === 0;
  const urgent  = !expired && timeLeft <= warnAt;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
      padding: compact ? 'var(--sp-2) var(--sp-3)' : 'var(--sp-3) var(--sp-4)',
      background: expired
        ? 'var(--color-red-bg)'
        : urgent ? 'rgba(239,68,68,0.08)' : 'var(--color-surface-1)',
      border: `1px solid ${expired
        ? 'var(--color-red-border)'
        : urgent ? 'rgba(239,68,68,0.3)' : 'var(--color-surface-2)'}`,
      borderRadius: 'var(--radius-md)',
    }}>
      <span style={{
        fontFamily: 'var(--font-body)', fontWeight: 700,
        fontSize: 'var(--text-xs)', letterSpacing: '1.5px',
        textTransform: 'uppercase', color: 'var(--color-text-muted)',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-stats)',
        fontSize: compact ? 'var(--text-xl)' : 'var(--text-2xl)',
        color: expired ? 'var(--color-red)' : urgent ? '#f97316' : 'var(--color-text-primary)',
        minWidth: 44, textAlign: 'center',
        fontVariantNumeric: 'tabular-nums', letterSpacing: 2,
      }}>
        {timeLeft}
      </span>
      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginLeft: 'auto' }}>
        <button
          onClick={() => {
            if (timeLeft === 0) {
              reset();
              setRunning(true);
            } else {
              setRunning(r => !r);
            }
          }}
          style={{
            padding: 'var(--sp-2) var(--sp-3)',
            borderRadius: 'var(--radius-sm)',
            background: running ? 'var(--color-red-bg)' : 'var(--color-green-bg)',
            border: running ? '1px solid var(--color-red-border)' : '1px solid var(--color-green-border)',
            color: running ? 'var(--color-red)' : 'var(--color-green)',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
            cursor: 'pointer', minHeight: 36, minWidth: 40,
          }}
          aria-label={running ? `Pause ${label}` : `Start ${label}`}
        >
          {running ? '⏸' : '▶'}
        </button>
        <button
          onClick={reset}
          style={{
            padding: 'var(--sp-2) var(--sp-3)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-surface-3)',
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
            cursor: 'pointer', minHeight: 36,
          }}
          aria-label={`Reset ${label}`}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ─── Expiry chirp ────────────────────────────────────────────────────────────
// Short two-tone beep synthesized on the fly. Respects the browser's
// autoplay policy — the first start/reset interaction unlocks audio
// automatically on most tablets.
let _audioCtx = null;
function playChirp() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!_audioCtx) _audioCtx = new Ctx();
    const now = _audioCtx.currentTime;

    const play = (freq, start, duration) => {
      const osc  = _audioCtx.createOscillator();
      const gain = _audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.2, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain).connect(_audioCtx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.02);
    };

    play(880, 0,    0.18);
    play(660, 0.22, 0.28);
  } catch {
    // Audio is a nice-to-have; visuals carry the signal regardless.
  }
}
