/**
 * localAdapter.js — an axios adapter that fulfils requests from the on-device
 * backend (localBackend) instead of the network. Installed on the shared
 * apiClient when REACT_APP_LOCAL_MODE === 'true', so every screen keeps calling
 * the same `apiClient` with no changes.
 */

import { handleRequest } from './localBackend';

function parseUrl(config) {
  // config.url is relative to baseURL ('/api'); it may carry a query string.
  const raw = config.url || '';
  const qIdx = raw.indexOf('?');
  const path = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const query = {};
  if (qIdx >= 0) {
    new URLSearchParams(raw.slice(qIdx + 1)).forEach((v, k) => (query[k] = v));
  }
  // Merge any params passed via config.params.
  if (config.params && typeof config.params === 'object') {
    for (const [k, v] of Object.entries(config.params)) if (v != null) query[k] = String(v);
  }
  return { path, query };
}

function parseBody(config) {
  const d = config.data;
  if (d == null) return null;
  if (typeof d === 'string') {
    try { return JSON.parse(d); } catch { return d; }
  }
  return d;
}

export default function localAdapter(config) {
  return new Promise((resolve, reject) => {
    const { path, query } = parseUrl(config);
    const method = (config.method || 'get').toUpperCase();
    const body = parseBody(config);
    const headers = config.headers || {};

    handleRequest({ method, path, query, body, headers })
      .then(({ status, data }) => {
        const response = {
          data,
          status,
          statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
          headers: {},
          config,
          request: {},
        };
        const validate = config.validateStatus || ((s) => s >= 200 && s < 300);
        if (validate(status)) {
          resolve(response);
        } else {
          const err = new Error(`Request failed with status code ${status}`);
          err.config = config;
          err.response = response;
          err.isAxiosError = true;
          reject(err);
        }
      })
      .catch((e) => {
        // Treat as a 500-style local failure with a response so interceptors
        // that read err.response don't crash.
        const err = new Error(e?.message || 'Local backend error');
        err.config = config;
        err.response = { data: { error: e?.message || 'Local backend error' }, status: 500, statusText: 'Error', headers: {}, config };
        err.isAxiosError = true;
        reject(err);
      });
  });
}
