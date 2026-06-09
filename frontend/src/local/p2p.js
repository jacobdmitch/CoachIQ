/**
 * p2p.js — host-authoritative multi-coach transport over Multipeer Connectivity
 * (Bluetooth + local WiFi, no server). One device hosts the live game (the
 * authority, same role the server played); assistant devices join and exchange
 * messages with it.
 *
 * Message protocol (JSON strings over Multipeer):
 *   host  -> guests: { t: 'bootstrap', game, roster, season }   // on join
 *   host  -> guests: { t: 'state', state, playtime, equityFlags } // after every change
 *   guest -> host:   { t: 'mutation', method, path, body }        // a coach action
 *
 * The native plugin is iOS-only; on web/simulator-without-peers these calls
 * resolve to no-ops or reject (caught), so nothing breaks when nobody's nearby.
 */

import { registerPlugin } from '@capacitor/core';

const Multipeer = registerPlugin('Multipeer');

class NearbySync {
  constructor() {
    this.role = 'idle';
    this.room = '';
    this.handles = [];
    this.onMessage = null; // (obj, peerName) => void
    this.onPeers = null; // (peerNames[]) => void
  }

  available() {
    return !!(Multipeer && typeof Multipeer.startHost === 'function');
  }

  async _attach() {
    await this._detach();
    const add = async (evt, fn) => {
      try { this.handles.push(await Multipeer.addListener(evt, fn)); } catch { /* web stub */ }
    };
    await add('message', (d) => {
      if (!this.onMessage || !d?.data) return;
      try { this.onMessage(JSON.parse(d.data), d.peer); } catch { /* ignore malformed */ }
    });
    const peers = (d) => this.onPeers && this.onPeers(d?.peers || []);
    await add('peerConnected', peers);
    await add('peerDisconnected', peers);
  }

  async _detach() {
    for (const h of this.handles) { try { await h.remove(); } catch { /* noop */ } }
    this.handles = [];
  }

  async startHost(room, { onMessage, onPeers } = {}) {
    this.role = 'host';
    this.room = room;
    this.onMessage = onMessage;
    this.onPeers = onPeers;
    await this._attach();
    return Multipeer.startHost({ room });
  }

  async startGuest(room, { onMessage, onPeers } = {}) {
    this.role = 'guest';
    this.room = room;
    this.onMessage = onMessage;
    this.onPeers = onPeers;
    await this._attach();
    return Multipeer.startGuest({ room });
  }

  async send(obj) {
    try { return await Multipeer.send({ data: JSON.stringify(obj) }); }
    catch { return { sent: false }; }
  }

  async stop() {
    await this._detach();
    this.role = 'idle';
    this.room = '';
    this.onMessage = null;
    this.onPeers = null;
    try { await Multipeer.stop(); } catch { /* noop */ }
  }
}

export const nearby = new NearbySync();
export default nearby;

/** 6-char room code for pairing (shown on the host, entered on guests). */
export function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += alphabet[Math.floor(Math.random() * alphabet.length)];
  return c;
}
