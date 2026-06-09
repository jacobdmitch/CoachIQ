import { registerPlugin } from '@capacitor/core';

/**
 * Multipeer — Bluetooth + local-WiFi peer sync (iOS MultipeerConnectivity).
 * Methods: startHost({room}), startGuest({room}), stop(), send({data}), getStatus().
 * Events: peerConnected, peerDisconnected, message, peerConnecting, peerLost,
 *         hostingStarted, browsingStarted, sendError.
 */
export const Multipeer = registerPlugin('Multipeer');

export default Multipeer;
