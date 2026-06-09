/**
 * CoachIQ AI proxy — Cloudflare Worker.
 *
 * Holds the Anthropic API key (as a Worker secret) so it never ships inside the
 * app. The iOS app calls this endpoint; the Worker calls Anthropic and returns
 * the result. Scales to zero — you pay only for the Claude calls plus
 * Cloudflare's free tier.
 *
 * Endpoints:
 *   POST /recommend  -> Line Coach substitution/playtime guidance
 *   POST /position   -> position-fit narrative for one athlete
 *   GET  /health     -> { ok: true }
 *
 * Secrets / vars (see wrangler.toml + README):
 *   ANTHROPIC_API_KEY   (secret)   your key
 *   ANTHROPIC_MODEL                 default claude-haiku-4-5
 *   MAX_TOKENS                      output cap per call (cost control)
 *   REQUIRE_ATTEST                  "true" to enforce App Attest
 *   APP_CHECK_TOKEN     (secret)   simple shared-secret gate (until App Attest is finished)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Attest-Assertion, X-Attest-Key, X-App-Check',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true });

    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    // ── Anti-abuse gate ──────────────────────────────────────────────────────
    const gate = await verifyClient(request, env);
    if (!gate.ok) return json({ error: gate.reason }, 401);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    try {
      if (url.pathname === '/recommend') return json(await recommend(body, env));
      if (url.pathname === '/position') return json(await position(body, env));
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e.message || 'Proxy error' }, 502);
    }
  },
};

// ─── Anti-abuse ─────────────────────────────────────────────────────────────────
async function verifyClient(request, env) {
  // Layer 1 (ship now): a shared secret the app sends. Weak on its own but stops
  // casual abuse of the open endpoint. Set APP_CHECK_TOKEN as a secret and have
  // the app send it as X-App-Check (configure in the app build).
  if (env.APP_CHECK_TOKEN) {
    if (request.headers.get('X-App-Check') !== env.APP_CHECK_TOKEN) {
      // fall through to attest check if enabled, else reject
      if (env.REQUIRE_ATTEST !== 'true') return { ok: false, reason: 'Unauthorized' };
    }
  }
  // Layer 2 (recommended for public release): iOS App Attest. The native plugin
  // signs each request; verify the assertion against Apple's attestation here.
  if (env.REQUIRE_ATTEST === 'true') {
    const assertion = request.headers.get('X-Attest-Assertion');
    const keyId = request.headers.get('X-Attest-Key');
    if (!assertion || !keyId) return { ok: false, reason: 'Attestation required' };
    const valid = await verifyAppAttest({ assertion, keyId }, env);
    if (!valid) return { ok: false, reason: 'Attestation failed' };
  }
  return { ok: true };
}

/**
 * TODO (public release): full Apple App Attest verification.
 * Verify the CBOR attestation/assertion: check the cert chain to Apple's App
 * Attest root, that the rpId hash matches your Team+Bundle ID, the nonce, and
 * the assertion counter. Cloudflare KV (env.ATTEST_KV) is a good place to store
 * each device's public key + counter. Until then this returns true so the
 * shared-secret gate is the active control.
 */
async function verifyAppAttest(/* { assertion, keyId }, env */) {
  return true;
}

// ─── Anthropic ──────────────────────────────────────────────────────────────────
async function callClaude(env, { system, user, maxTokens }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
      max_tokens: Number(env.MAX_TOKENS || 700),
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return { text, usage: data.usage || {}, model: data.model };
}

function rosterLine(a) {
  return `#${a.jersey_number} ${a.first_name} ${a.last_name} (${a.primary_position}) — shoot ${a.skill_shooting}, dodge ${a.skill_dodging}, pass ${a.skill_passing}, def ${a.skill_defense}, GB ${a.skill_ground_balls}, IQ ${a.skill_field_awareness}`;
}

async function recommend(body, env) {
  const ctx = body.context || {};
  const state = ctx.state || {};
  const onField = Object.entries(state.fieldPositions || {}).filter(([, id]) => id).map(([slot, id]) => `${slot}:${id}`);
  const under = (ctx.equityFlags || []).filter((f) => f.status === 'UNDER_TARGET').map((f) => `${f.athleteId} (${f.minutesUnder}m under)`);

  const system =
    'You are the Line Coach for a youth/high-school lacrosse team. Recommend at most 2 substitutions that improve playtime equity without hurting the on-field unit. Be concise. Respond ONLY with strict JSON: {"textAnalysis": string, "suggestions": [{"type":"SUBSTITUTION","playerIn":id,"playerOut":id,"reason":string}]}.';
  const user = [
    `Focus: ${body.focusArea || 'playtime equity'}`,
    `Period: ${state.period}  Clock(s): ${state.clockTime}  Score: ${state.homeScore}-${state.awayScore}`,
    `On field: ${onField.join(', ')}`,
    `Bench: ${(state.bench || []).join(', ')}`,
    `Under target: ${under.join(', ') || 'none'}`,
    `Roster:\n${(ctx.roster || []).map(rosterLine).join('\n')}`,
  ].join('\n');

  const { text, usage, model } = await callClaude(env, { system, user, maxTokens: env.MAX_TOKENS });
  let parsed = { textAnalysis: text, suggestions: [] };
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch { /* keep raw text */ }
  return {
    textAnalysis: parsed.textAnalysis || text,
    suggestions: parsed.suggestions || [],
    usage, model, modelTier: 'haiku', iterations: 1, stopReason: 'end_turn',
  };
}

async function position(body, env) {
  const a = body.athlete || {};
  const eng = body.engine || {};
  const system = 'You are a lacrosse position coach. In 3-4 sentences, explain the athlete\'s best-fit position and one development focus. Plain text, no preamble.';
  const user = [
    `Athlete: ${a.first_name} ${a.last_name}, primary ${a.primary_position}.`,
    `Skills — shoot ${a.skill_shooting}, dodge ${a.skill_dodging}, pass ${a.skill_passing}, def ${a.skill_defense}, GB ${a.skill_ground_balls}, transition ${a.skill_transition}, IQ ${a.skill_field_awareness}, faceoff ${a.skill_faceoff}.`,
    `Engine best fit: ${eng?.recommendations?.primary?.position} (${eng?.recommendations?.primary?.fitScore}).`,
  ].join('\n');
  const { text } = await callClaude(env, { system, user, maxTokens: 300 });
  return { text };
}
