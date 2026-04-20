# CoachIQ v1 Launch Readiness

**Target:** Private beta with Jacob + 2-3 other coaches
**Bar:** Another coach can run a full game solo, on a tablet, with Jacob not in the room.
**Test plan:** Automated tests + scrimmage/dry-run + load/stress (no manual E2E script)

This doc has been updated with findings from a code audit on 2026-04-19. Items are now grouped by whether they are a **BLOCKER** (must close before beta), **GAP** (should close before beta), or **DEFER** (acceptable as post-beta work).

---

## Status snapshot (2026-04-19, end of day)

All four beta blockers have landed:

- **1.1 Signup flow** — COMPLETE. `SignupPage.js` + `/signup` route + `AuthContext.register()` wired, first-run team-create gate in place.
- **1.2 Server-restart recovery** — COMPLETE. `ensureGameState()` now re-registers the proactive scheduler on rehydrate (pulls coachId/teamId/format from `game_sessions`), the stray `gameStates.get()` at the period-end route is replaced with `await ensureGameState()`, and `PlaytimeTracker` running totals are reconstructed from `playtime_log` on rehydrate.
- **2.3 CI gate** — COMPLETE. `.github/workflows/ci.yml` runs `npm ci` + `npm test` on push/PR to `main`. Branch protection instructions added to README.
- **3.3 Observability** — COMPLETE. Sentry wired in backend (`services/sentry.js`) and frontend (`frontend/src/services/sentry.js` + `index.js` + `ErrorBoundary`). Request-ID middleware active. AI cost admin page in place.

Test coverage backfill (2.2) is also complete: **205 tests passing** across backend (142 in 45 suites) and frontend (63 in 7 suites). The five priority targets listed in 2.2 all have dedicated suites.

Remaining before beta: **scrimmage protocol (3.1)** and **load test (3.2)**. Both are execution, not engineering.

---

## Phase 1 — Reliability & UX gaps

### 1.1 New-coach onboarding — BLOCKER

**Audit finding:** Backend `/api/auth/register` endpoint exists (`routes/auth.js:137`) and creates a coach + default team in one call. **No frontend UI exists to reach it.** `LoginPage.js` has an email/password form only — no "Create account" link, no signup route in `App.js`. A beta coach cannot sign up unassisted.

Work to do:

1. Add `SignupPage.js` component. Fields: email, password, confirm password, first name, last name, team name (optional). Validates password >= 8 chars (to match backend).
2. Add `/signup` public route in `App.js`.
3. Add "Create account" link from `LoginPage` to `/signup` and "Already have an account" back-link on signup.
4. Extend `AuthContext` with a `register()` method that calls `POST /api/auth/register`, stores the returned token/refreshToken, and redirects to `/dashboard`.
5. First-run flow after signup: if the new coach has no team, force them to the team-create screen before dashboard. If `teamName` was provided at signup, they have a team and go straight to roster import.

### 1.2 Server restart recovery mid-game — GAP (partial today)

**Audit finding:** `gamePersistence.js` has `saveGameStateSnapshot` and `loadGameStateSnapshot`, and `routes/game-live.js:134` implements `ensureGameState()` which rehydrates from the snapshot on demand. Almost every mutation calls `saveGameStateSnapshot` after a state change (clock, sub, period transitions, stat log, etc.). This is actually solid.

But the audit surfaced three concrete gaps, all documented in the code itself:

- **Proactive scheduler does not re-register after restart.** `routes/game-live.js:239` says: *"Not wired on rehydrate: after a dyno restart proactive pushes pause until the next game start."* This is a real hole — AI pushes stop silently.
- **`POST /:gameId/period/end` uses `gameStates.get()` directly** (line 333) instead of `await ensureGameState()`. A restart between period boundary and the ref blowing the whistle will 400 the end-period request.
- **In-memory playtime totals are lost on restart.** `persistPlaytimeEntry` writes completed stints to `playtime_log`, but `PlaytimeTracker`'s in-memory running totals reset. Coaches looking at live minutes mid-game will see the wrong numbers post-restart.

Work to do:

1. In `ensureGameState` (game-live.js:134), after rehydrating the in-memory entry, also call `proactiveCoach.register(gameId, ...)` if not already registered. Needs coachId + teamId + format — pull from `game_sessions` row that `saveGameStateSnapshot` writes.
2. Replace the direct `gameStates.get(gameId)` at game-live.js:333 with `await ensureGameState(gameId)`. Spot-check the rest of the file for the same pattern; replace all.
3. On rehydrate, reconstruct `PlaytimeTracker` season totals from `playtime_log` for the current game (sum minutes_played grouped by athlete_id). Alternative: accept the reset and surface a one-line warning in the playtime panel. Pick one; document the choice.

### 1.3 Tablet offline → online reconciliation — GAP

**Audit finding:** Not re-audited in this pass — prior audit confirmed `syncClient` + `IndexedDB` queue exists. Needs an actual end-to-end scrimmage run to validate. Keep on the scrimmage protocol checklist.

### 1.4 Proactive push failure paths — COMPLETE

**Audit finding:** Accept auto-executes substitution, failures surface via toast and keep the banner visible. Ack/dismiss failure toasts already wired. All production code is in place. Still want to verify once during the scrimmage with a real network glitch.

### 1.5 AI recommendation explainability — COMPLETE

**Audit finding:** Engine includes `reason: input.reason` in the suggestion payload (`services/lineCoachEngine.js:400`). Banner renders it via the `ppush-sub-reason` div (`ProactivePushBanner.js:164`). Explainability is wired end to end. Keep spot-check on the scrimmage checklist (do 10 pushes have coherent reasons?).

### 1.6 Error surfaces audit — GAP

**Audit finding:** Not re-audited in detail. The backend uses `errorHandler` middleware globally and routes throw `AppError` consistently. Frontend has `ToastProvider` but coverage per component is inconsistent. Real test: walk the app with the devtools network panel 500-ing a few routes during a scrimmage.

### 1.7 Partial items from prior audit — RESOLVED

- **RAG wiring across tool tiers.** CONFIRMED partial. `services/lineCoachEngine.js:27` only maps `suggest_substitution` and `evaluate_lineup` to `LINEUP_WRITE`. Other tools (`analyze_playtime`, `flag_alert`, `position_recommendation`) get no RAG context. Decision: **DEFER** for beta. The engine still has live in-memory state and season stats in the gameContext; RAG is an enrichment, not a prereq. Revisit post-beta when we see which tools benefit most.
- **Opponent threat ranking UI.** NOT an orphan. `OpponentThreatsPanel.js` is a real component that fetches `/api/game-live/:gameId/threats` and subscribes to `opponent_threats` socket broadcasts. Resolved — no action needed.
- **`positionEngine.js` / `situationResolver.js`.** NOT legacy. `positionEngine.getPositionRecommendations` is used by `routes/ai-coach.js:163` (position-fit endpoint). `situationResolver` is used by `lineBuilder.js`, `game-live.js`, `ai-coach.js`, and has its own test. Both are live. Resolved — no action needed.

---

## Phase 2 — Automated test coverage backfill

### 2.1 Current coverage baseline

Backend tests (`tests/`):
- `services/email-service.test.js`
- `services/line-builder.test.js`
- `services/playtime-tracker.test.js`
- `services/proactive-coach.test.js` (added last session)
- `services/rotation-validator.test.js`
- `services/situation-resolver.test.js`
- `services/tier-config.test.js`
- `routes/athletes-parent-contacts.test.js`
- `routes/lines-rotations.test.js`

Frontend tests:
- 3 component tests (`StagingPanel`, `PlayerActionMenu`, `RotationManager`)
- 3 hook tests (`useRotations`, `useLines`, `useRoster`)

**What's NOT covered (critical paths):**

- `services/lineCoachEngine.js` — the agentic loop, recovery, RAG pre-fetch. Zero tests.
- `services/gamePersistence.js` — rehydrate path. Zero tests.
- `services/liveGameStore.js`, `services/gameStateManager.js` — state mutations. Zero tests.
- `routes/game-live.js` — clock, sub, stat-log, period transitions. Zero tests.
- `routes/ai-coach.js` — recommendations endpoint, proactive ack/dismiss. Zero tests.
- `routes/game-sync.js` — socket.io auth + room join. Zero tests.
- `routes/auth.js` — login, register, refresh, password change. Zero tests.
- Frontend `syncClient.js` — offline queue replay. Zero tests.

### 2.2 Test targets (priority order)

1. **`lineCoachEngine` agentic loop** — happy path, recovery on tool error, hard-fail at max iterations, RAG preamble injection, invocation log writes.
2. **`/api/game-live` critical mutations** — clock start/stop, substitute (valid + invalid position + bad athlete), stat-log, idempotency replay.
3. **`gamePersistence` rehydrate** — snapshot round-trip, rehydrate-into-empty-store, proactive scheduler re-register on rehydrate (after fix lands).
4. **`/api/auth`** — register new coach, duplicate email rejection, login, refresh, me.
5. **Frontend `syncClient`** — queue on network error, replay in order, idempotency key propagation.

### 2.3 CI gate — BLOCKER

**Audit finding:** No `.github/workflows/` directory exists in the repo. No CI at all. `package.json` defines `npm test`, `npm run test:backend`, `npm run test:frontend`, but nothing runs them.

Work to do:

1. Add `.github/workflows/ci.yml` — runs `npm ci`, `npm test` on push + PR to `main`.
2. Add branch protection on `main` requiring CI green to merge (manual GitHub setting, documented in README).
3. Render auto-deploy on `main` is already the default behavior via `render.yaml`. Once CI gates merges, failing tests can't reach Render.

---

## Phase 3 — Scrimmage protocol + load/stress test + observability

### 3.1 Scrimmage / dry-run protocol

Unchanged from previous draft. 16-step script in `Phase 3.1`. Keep.

### 3.2 Load / stress test plan

Unchanged from previous draft. k6, 5 → 20 concurrent games. Keep.

### 3.3 Observability — BLOCKER

**Audit finding:** Current state is Winston JSON logs to console + file (`services/logger.js`), with `logs/error.log` and `logs/combined.log` in production. No request ID, no Sentry, no APM, no dashboard. Grep for "sentry" returns zero matches.

Minimum viable observability for beta:

1. **Error tracking:** Sentry (free tier) wired into backend + frontend. Catches uncaught exceptions, unhandled promise rejections, React render errors. Tags events with coachId when available.
2. **Request ID middleware:** generate a short request ID, attach to `req.id`, include in every log line and the response header. Makes it possible to trace a single failed request through backend logs.
3. **AI cost dashboard:** already have `ai_call_logs` and `ai_invocation_log` tables. Add a simple admin-only page that shows cost-per-coach-per-day for the last 7 days. Catches runaway spend before it hits the Render bill.
4. **Alerting:** Sentry default alerts for new-in-environment errors + a volume spike alert. Render has its own alerting for health-check failures.

This is called BLOCKER because "something broke during the beta and we don't know what" is not an acceptable state.

---

## Revised order of execution

Blockers first, in this order:

1. **Signup flow (1.1)** — without this, beta coaches cannot sign up.
2. **Observability (3.3)** — without this, we are running blind.
3. **CI gate (2.3)** — without this, regressions ship silently.
4. **Server-restart proactive re-registration + endpoint cleanup (1.2)** — silent AI pause and 400 errors after a dyno cycle.

Gaps next:

5. **Test coverage backfill (2.2)** — in the priority order above.
6. **Offline reconciliation validation (1.3)** — covered by the scrimmage, but pre-test locally.
7. **Error surface audit (1.6)** — focused pass during scrimmage prep.

Then run:

8. **Scrimmage (3.1)** — with Jacob on the field.
9. **Load test (3.2)** — staging environment, before inviting the other coaches.
10. **Invite the beta coaches.**

## Decisions carried forward (no action needed)

- RAG across non-LINEUP_WRITE tiers — DEFER to post-beta.
- `positionEngine` / `situationResolver` — both live, no cleanup needed.
- Opponent threat ranking — already surfaced in `OpponentThreatsPanel`.
- Playtime rehydrate — decide between restoring from `playtime_log` vs. showing a "reset after restart" warning; either is acceptable.

## Assumptions I'm still flagging

- Private beta means Jacob is reachable for the 2-3 coaches if they get stuck. Zero-touch would raise the bar on 1.1 and 1.6.
- Render starter plan is fine for 4 concurrent games. Load test will confirm or disprove.
- Web app in a tablet browser is the shipping form factor — no PWA install, no native shell.
- Single coach per game (no simultaneous head + assistant editing). `session_participants` + `requireGameRole` middleware exist, but simultaneous editing hasn't been validated.
