import type { PluginListenerHandle } from '@capacitor/core';

export interface MultipeerStatus {
  role: 'host' | 'guest' | 'idle';
  room: string;
  peers: string[];
}

export interface MultipeerPlugin {
  startHost(options: { room: string }): Promise<{ role: string; room: string }>;
  startGuest(options: { room: string }): Promise<{ role: string; room: string }>;
  stop(): Promise<void>;
  send(options: { data: string }): Promise<{ sent: boolean }>;
  getStatus(): Promise<MultipeerStatus>;
  addListener(eventName: string, listener: (data: any) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export declare const Multipeer: MultipeerPlugin;
