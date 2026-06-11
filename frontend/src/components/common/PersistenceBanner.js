import React, { useEffect, useState } from 'react';
import { subscribePersistence } from '../../local/localDb';

/**
 * PersistenceBanner — a fixed, unmissable warning shown when on-device writes
 * keep failing (quota, storage eviction, disk pressure). On the sideline this
 * is the difference between a recoverable hiccup and losing a game's stats:
 * it tells the coach to keep the app open while writes retry in the background.
 */
export default function PersistenceBanner() {
  const [failing, setFailing] = useState(false);
  useEffect(() => subscribePersistence(setFailing), []);
  if (!failing) return null;
  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#B91C1C',
        color: '#FFFFFF',
        padding: 'calc(env(safe-area-inset-top) + 8px) 16px 10px',
        textAlign: 'center',
        fontFamily: "'Nexa', system-ui, -apple-system, sans-serif",
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: 0.3,
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      Data isn’t saving — keep the app open. Retrying…
    </div>
  );
}
