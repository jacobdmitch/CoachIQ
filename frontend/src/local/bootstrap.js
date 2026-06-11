/**
 * bootstrap.js — prepares standalone mode before React mounts: seeds the
 * on-device database (first run) and sets a local session so the app opens
 * straight to the dashboard instead of a login screen.
 */

import * as store from './localDb';

export const LOCAL_MODE = process.env.REACT_APP_LOCAL_MODE === 'true';

export async function bootstrapLocal() {
  if (!LOCAL_MODE) return;
  await store.ready();
  // Guard localStorage: a thrown quota/privacy error here (before React mounts)
  // would otherwise blank the app. Worst case we fall through to the login screen.
  try {
    if (!localStorage.getItem('token')) localStorage.setItem('token', 'local-token');
    const team = store.all('teams')[0];
    if (team && !localStorage.getItem('activeTeamId')) {
      localStorage.setItem('activeTeamId', team.id);
    }
  } catch { /* storage unavailable */ }
}
