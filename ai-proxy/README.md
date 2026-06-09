# CoachIQ AI proxy

A tiny Cloudflare Worker that holds your Anthropic API key so it never ships
inside the app. The iOS app calls this; the Worker calls Claude and returns the
result. It scales to zero — you pay only for the Claude calls plus Cloudflare's
free tier.

## Deploy (one time)

```bash
npm install -g wrangler          # Cloudflare CLI
cd ai-proxy
wrangler login                   # opens browser, links your Cloudflare account

# Secrets (never committed):
wrangler secret put ANTHROPIC_API_KEY     # paste your Anthropic key
wrangler secret put APP_CHECK_TOKEN       # any long random string

wrangler deploy
```

`wrangler deploy` prints your URL, e.g. `https://coachiq-ai.<you>.workers.dev`.

## Point the app at it

In `frontend/.env` set:

```
REACT_APP_AI_PROXY_URL=https://coachiq-ai.<you>.workers.dev
```

Then rebuild the app (`npm run ios:sync`). Leaving it blank ships the app with
AI turned off.

## Cost controls (already wired)

- **Haiku model** (`ANTHROPIC_MODEL` in `wrangler.toml`). Do not switch the live
  Line Coach to Sonnet — it multiplies cost 3-4x.
- **`MAX_TOKENS`** caps output per call. 700 is a safe default; lower it to spend
  less.
- The app only calls the proxy when you tap for advice, so there's no runaway
  proactive loop by default.

To add a hard per-day cap, bind a Cloudflare KV namespace and increment a
counter in `verifyClient` (left as a documented extension).

## Security

- **Layer 1 (active now):** `APP_CHECK_TOKEN`. The app sends it as `X-App-Check`;
  the Worker rejects requests without it. Stops casual abuse of the open URL.
- **Layer 2 (before public launch):** iOS **App Attest**. Set
  `REQUIRE_ATTEST = "true"` and finish `verifyAppAttest()` in `worker.js`
  (verify Apple's attestation cert chain + assertion counter, store device keys
  in KV). The native side is the `AppAttest` plugin referenced by the app's
  `aiClient.js`.

The shared token is a build-time value, so treat it as low-assurance; App Attest
is what makes the endpoint genuinely app-only.
