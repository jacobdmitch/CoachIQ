/**
 * aiClient.js — talks to the serverless AI proxy (which holds the Anthropic
 * key). The app never sees the key. In production every request is signed with
 * an iOS App Attest assertion so the proxy can reject traffic that isn't from a
 * genuine copy of the app; if the native attest plugin isn't present (e.g.
 * simulator/dev), the call still goes out and the proxy decides how strict to be.
 */

import * as store from './localDb';

const PROXY = process.env.REACT_APP_AI_PROXY_URL || '';

async function getAttestation(payload) {
  // Lazy-load the native App Attest plugin only if it's installed.
  try {
    const mod = await import('@capacitor/core');
    const AppAttest = mod.registerPlugin('AppAttest');
    if (AppAttest?.assert) {
      const { assertion, keyId } = await AppAttest.assert({ clientData: JSON.stringify(payload) });
      return { assertion, keyId };
    }
  } catch {
    /* not available — dev/simulator */
  }
  return null;
}

function aiEnabled() {
  return store.db().settings?.aiEnabled !== false && !!PROXY;
}

async function callProxy(endpoint, payload) {
  if (!aiEnabled()) {
    const reason = !PROXY ? 'AI proxy not configured' : 'AI is turned off in Settings';
    const err = new Error(reason);
    err.code = 'AI_DISABLED';
    throw err;
  }
  const attest = await getAttestation(payload);
  // Abort a hung connection after 10s so the AI panel can't spin forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${PROXY.replace(/\/$/, '')}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(attest ? { 'X-Attest-Assertion': attest.assertion, 'X-Attest-Key': attest.keyId } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AI proxy ${res.status}: ${text || res.statusText}`);
    }
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('AI request timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Line Coach recommendation. Returns the recommendation shape the AI panel
 * expects. On any failure returns a graceful, empty-but-valid recommendation so
 * the UI degrades instead of crashing.
 */
export async function aiRecommend({ gameId, focusArea, context }) {
  try {
    const data = await callProxy('recommend', { gameId, focusArea, context });
    return {
      toolCalls: data.toolCalls || [],
      toolResults: data.toolResults || [],
      textAnalysis: data.textAnalysis || data.text || '',
      suggestions: data.suggestions || [],
      usage: data.usage || {},
      iterations: data.iterations || 1,
      stopReason: data.stopReason || 'end_turn',
      model: data.model || 'claude-haiku',
      modelTier: data.modelTier || 'haiku',
      latencyMs: data.latencyMs || 0,
    };
  } catch (e) {
    return {
      toolCalls: [], toolResults: [], suggestions: [],
      textAnalysis: e.code === 'AI_DISABLED'
        ? 'AI coaching is unavailable right now.'
        : `AI coaching could not be reached: ${e.message}`,
      usage: {}, iterations: 0, stopReason: 'error', model: 'none', modelTier: 'none', latencyMs: 0,
      error: e.message,
    };
  }
}

export async function aiPositionAnalysis({ athlete, engine }) {
  const data = await callProxy('position', { athlete, engine });
  return data.text || data.textAnalysis || '';
}

export async function aiRecap({ recap }) {
  const data = await callProxy('recap', { recap });
  return data.text || data.textAnalysis || '';
}

export default { aiRecommend, aiPositionAnalysis, aiRecap };
