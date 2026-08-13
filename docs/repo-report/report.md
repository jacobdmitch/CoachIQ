# Repository report — CoachIQ

*Generated 2026-08-13 from the local git checkout.*

## Highlights

- 35,107 lines across 157 code files. Primary language JavaScript. Mix: JavaScript 99%, Swift 1%, Shell 0%, TypeScript 0%.
- 46 commits by 3 contributors, 2026-04-14 to 2026-06-10.
- 46 commits in the last 12 months (freshness / activity signal).
- 5 merged PRs; sampled mix 0.0% simple / 20.0% standard / 80.0% rich.
- 100.0% of sampled PRs reference an issue in the commit body.
- Test-to-code ratio 12.8% (21 test files); ~91.2% of source files have no matching test.
- Build: CI configured (.github/workflows); dependency lockfiles present.
- License: none-found.
- ~620 functions and ~15 classes/types (regex estimate).

## Code metrics

| Metric | Value |
|---|---|
| Primary language | JavaScript |
| Total LoC | 35,107 across 157 code files |
| Merged PRs / Commits | 5 / 46 |
| PR mix (Simple/Standard/Rich) | 0.0% / 20.0% / 80.0% |
| Avg / median LoC per PR | 1,551 / 1,252 |
| % PRs referencing an issue | 100.0% |
| Test-to-code / % untested files | 12.8% / 91.2% |
| Functions / Classes (est.) | 620 / 15 |
| Contributors | 3 |
| History | 2026-04-14 → 2026-06-10 |
| License | none-found |


## Representative code

**`frontend/src/local/localDb.js`** — JavaScript, lines 155–194 of 263

```javascript
export function save() {
  scheduleSave();
}

// Write the document, retrying with backoff. After repeated failures we flag
// persistence-failing (the UI shows a banner) but keep retrying slowly so a
// transient cause (quota, WebKit eviction, disk pressure) can recover by itself.
async function flushWithRetry(attempt) {
  try {
    await persistNow();
    if (persistFailing) { persistFailing = false; notifyPersist(); }
  } catch (e) {
    if (attempt < 5) {
      const delay = Math.min(1000 * 2 ** attempt, 15000);
      setTimeout(() => flushWithRetry(attempt + 1), delay);
    } else {
      if (!persistFailing) {
        persistFailing = true;
        notifyPersist();
        try { captureException(e, { extra: { where: 'localDb.flushWithRetry' } }); } catch { /* ignore */ }
      }
      setTimeout(() => flushWithRetry(5), 15000); // keep trying slowly
    }
  }
}

export function persistNow() {
  if (!cache) return Promise.resolve();
  // Structured clone via JSON keeps the persisted copy detached from the mirror.
  return writeDoc(JSON.parse(JSON.stringify(cache)));
}

// ─── Collection helpers (operate on the in-memory mirror) ───────────────────────
export function db() {
  if (!cache) throw new Error('localDb not ready — await ready() first');
  return cache;
}

export function all(collection) {
  return db()[collection] || [];
```

**`services/emailService.js`** — JavaScript, lines 88–127 of 361

```javascript
function fallbackNarrative(game, teamName, totals) {
  const home = Number(game.score_home);
  const away = Number(game.score_away);
  let outcome = `${teamName} played ${game.opponent}`;
  if (Number.isFinite(home) && Number.isFinite(away)) {
    if (home > away)       outcome = `${teamName} defeated ${game.opponent} ${home}–${away}`;
    else if (home < away)  outcome = `${teamName} fell to ${game.opponent} ${home}–${away}`;
    else                   outcome = `${teamName} tied ${game.opponent} ${home}–${away}`;
  }
  const fo = totals.faceoff_wins + totals.faceoff_losses;
  const foPart = fo > 0 ? `, ${totals.faceoff_wins}–${totals.faceoff_losses} at the X` : '';
  return `${outcome}. The team recorded ${totals.goals} goal${totals.goals === 1 ? '' : 's'} ` +
         `on ${totals.shots} shot${totals.shots === 1 ? '' : 's'}, ${totals.ground_balls} ground ball${totals.ground_balls === 1 ? '' : 's'}${foPart}.`;
}

/**
 * Ask Claude for a short game narrative (2–3 sentences). Returns a string on
 * success, or null if the API is unavailable. Never throws — the caller is
 * expected to fall back.
 */
async function generateNarrative(game, teamName, totals) {
  const client = await getAnthropic();
  if (!client) return null;
  try {
    const prompt = [
      `Team: ${teamName}`,
      `Opponent: ${game.opponent}`,
      `Final score: ${teamName} ${game.score_home ?? '?'} – ${game.opponent} ${game.score_away ?? '?'}`,
      `Team totals — goals: ${totals.goals}, assists: ${totals.assists}, shots: ${totals.shots}, ` +
        `ground balls: ${totals.ground_balls}, saves: ${totals.saves}, turnovers: ${totals.turnovers}, ` +
        `faceoffs: ${totals.faceoff_wins}–${totals.faceoff_losses}`,
      '',
      'Write a 2–3 sentence recap of this lacrosse game. Mention the outcome and one or two notable team stats. ' +
      'Plain prose, no bullet points, no markdown, no headings. Do not invent player names or events not supported by the stats above.',
    ].join('\n');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
```

**`frontend/src/services/offlineQueue.js`** — JavaScript, lines 84–123 of 131

```javascript
export async function listPending(gameId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const results = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return resolve(results);
      if (!gameId || cursor.value.gameId === gameId) results.push(cursor.value);
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/**
 * Remove a pending op by id. Called after a successful replay.
 */
export async function removePending(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * Count pending ops for a game (or all games if gameId omitted). Used by
 * the UI to show a "N queued" badge.
 */
export async function countPending(gameId) {
  const ops = await listPending(gameId);
  return ops.length;
}

/**
```

## Sample pull requests

**Merge pull request #3 from jacobdmitch/ai/architecture-v2-foundation**

- 2026-04-19 · 8 files · +1119/-2 · linked issue, touches tests
- files: `frontend/src/components/ai/ProactivePushBanner.js`, `frontend/src/components/game/GameMode.js`, `frontend/src/hooks/useGameSocket.js`, `routes/ai-coach.js`, `routes/game-live.js`

```diff
diff --git a/frontend/src/components/ai/ProactivePushBanner.js b/frontend/src/components/ai/ProactivePushBanner.js
--- /dev/null
+++ b/frontend/src/components/ai/ProactivePushBanner.js
@@ -0,0 +1,173 @@
+import React, { useEffect, useState } from 'react';
+import Badge from '../common/Badge';
+import Button from '../common/Button';
+import './ProactivePushBanner.css';
+
+/**
+ * ProactivePushBanner — top-anchored banner surface for proactive Line Coach
+ * recommendations during a live game.
+ *
+ * Behavior:
+ *   - Fixed to top of viewport, sitting above page content
+ *   - Slides down from top on mount, up on unmount (via push key change)
+ *   - Urgency-coded border + pill: high→red, medium→amber, low→blue
+ *   - Two large touch targets (Dismiss, Accept) meeting HIG 44pt min
+ *   - Replace-with-newest: a new push while one is shown swaps body + key
+ *     so the animation re-plays and the coach notices the change
+ *
+ * Props:
+ *   push            - null when nothing to show, else { pushId, pushedAt,
+ *                     reason, suggestion: { type, urgency, ...fields } }
+ *   onAcknowledge(push) - called when coach taps Accept; full push is
+ *                        forwarded so the parent can dispatch by type
+ *                        (e.g., auto-execute a SUBSTITUTION).
+ *   onDismiss(pushId)   - called when coach taps Dismiss
+ *   resolveAthleteName  - optional (uuid) => string resolver; keeps the
+ *                        banner dumb about roster lookups. Falls back to
+ *                        the raw UUID when unavailable or not found.
+ */
+export default function ProactivePushBanner({
+  push,
+  onAcknowledge,
+  onDismiss,
+  resolveAthleteName,
+}) {
+  // `visible` drives the enter/exit animation. When `push` flips from null
+  // to a value we mount the element and flag visible; when it flips back to
+  // null we keep the element mounted briefly to play the exit transition,
+  // then drop it from the DOM.
+  const [visible, setVisible] = useState(false);
+  const [current, setCurrent] = useState(null);
+
+  useEffect(() => {
+    if (push) {
+      setCurrent(push);
+      // Next tick so the browser applies the initial off-screen transform
+      // before we flip `visible` and trigger the transition.
+      const id = requestAnimationFrame(() => setVisible(true));
+      return () => cancelAnimationFrame(id);
+    }
+    setVisible(false);
+    // Keep the old payload around through the 200ms exit transition so the
+    // text doesn't vanish during the slide-up.
+    const timeout = setTimeout(() => setCurrent(null), 220);
+    return () => clearTimeout(timeout);
+  }, [push]);
+

… diff truncated …
```

**Merge pull request #5 from jacobdmitch/ai/architecture-v2-foundation**

- 2026-04-19 · 17 files · +1991/-19 · linked issue, touches tests
- files: `frontend/src/App.js`, `frontend/src/components/ErrorBoundary.js`, `frontend/src/components/auth/LoginPage.js`, `frontend/src/components/auth/SignupPage.js`, `frontend/src/context/AuthContext.js`

```diff
diff --git a/frontend/src/App.js b/frontend/src/App.js
--- a/frontend/src/App.js
+++ b/frontend/src/App.js
@@ -5,4 +5,5 @@ import { ToastProvider } from './context/ToastContext';
 import AppShell from './components/layout/AppShell.js';
 import LoginPage from './components/auth/LoginPage.js';
+import SignupPage from './components/auth/SignupPage.js';
 
 // Lazy-load page-level components to keep initial bundle small
@@ -87,4 +88,14 @@ export default function App() {
             />
 
+            {/* Public: signup */}
+            <Route
+              path="/signup"
+              element={
+                <PublicRoute>
+                  <SignupPage />
+                </PublicRoute>
+              }
+            />
+
             {/* Public: athlete share link (no auth) */}
             <Route path="/share/player/:token" element={<PlayerShareView />} />
diff --git a/frontend/src/components/ErrorBoundary.js b/frontend/src/components/ErrorBoundary.js
--- /dev/null
+++ b/frontend/src/components/ErrorBoundary.js
@@ -0,0 +1,98 @@
+import React from 'react';
+import { captureException } from '../services/sentry';
+
+/**
+ * ErrorBoundary — catches render-phase exceptions in the React tree and
+ * shows a minimal recovery UI instead of a white screen. On the sideline
+ * this matters: an unhandled error mid-game should not wipe the screen
+ * with no path back.
+ *
+ * Errors are forwarded to Sentry (noop when DSN unset). The user gets a
+ * reload button, which is the cheapest thing that resets state to a known
+ * good point — local state is lost but persisted game state rehydrates
+ * from the server on reconnect.
+ */
+export default class ErrorBoundary extends React.Component {
+  constructor(props) {
+    super(props);
+    this.state = { error: null };
+  }
+
+  static getDerivedStateFromError(error) {
+    return { error };
+  }
+
+  componentDidCatch(error, info) {
+    captureException(error, { extra: { componentStack: info?.componentStack } });
+    // Also log to console so the coach can screenshot it during beta.
+    // eslint-disable-next-line no-console
+    console.error('ErrorBoundary caught:', error, info);
+  }
+
+  handleReload = () => {

… diff truncated …
```

**Merge pull request #2 from jacobdmitch/ai/architecture-v2-foundation**

- 2026-04-18 · 11 files · +977/-275 · linked issue
- files: `routes/ai-coach.js`, `services/agents/lineCoachAgent.js`, `services/agents/lineupAgent.js`, `services/agents/orchestrator.js`, `services/agents/playtimeAgent.js`

```diff
diff --git a/routes/ai-coach.js b/routes/ai-coach.js
--- a/routes/ai-coach.js
+++ b/routes/ai-coach.js
@@ -88,9 +88,13 @@ router.post(
     });
 
-    // Call Line Coach AI
+    // Call Line Coach AI. playtimeTracker is forwarded so the agentic loop
+    // can execute tools like analyze_playtime against live tracker state.
+    // coachId enables per-tool audit logging in ai_invocation_log.
     const recommendation = await getLineCoachRecommendation(gameState, playtimeData, {
       format: game.format,
       seasonStats,
       focusArea,
+      playtimeTracker,
+      coachId: req.coachId,
     });
 
@@ -100,5 +104,5 @@ router.post(
     await logAICall({
       coachId: req.coachId,
-      model: 'claude-haiku-4-5-20251001',
+      model: recommendation.model || 'claude-haiku-4-5-20251001',
       inputTokens: recommendation.usage?.input_tokens || 0,
       outputTokens: recommendation.usage?.output_tokens || 0,
diff --git a/services/agents/lineCoachAgent.js b/services/agents/lineCoachAgent.js
--- a/services/agents/lineCoachAgent.js
+++ b/services/agents/lineCoachAgent.js
@@ -1,182 +1,22 @@
-import logger from '../logger.js';
-
-/**
- * Line Coach Agent
- * Processes tool calls from Claude and executes them against game state.
- * Bridges between Claude's recommendations and actual game state mutations.
- */
-
-/**
- * Execute a tool call from Claude
- * @param {string} toolName - Tool name from Claude
- * @param {Object} toolInput - Tool input from Claude
- * @param {Object} gameState - Current game state manager
- * @param {Object} playtimeTracker - Current playtime tracker
- * @returns {Object} Tool result
- */
-export async function executeToolCall(toolName, toolInput, gameState, playtimeTracker) {
-  logger.debug(`Executing tool: ${toolName}`, { input: toolInput });
-
-  try {
-    switch (toolName) {
-      case 'suggest_substitution':
-        return _handleSubstitutionSuggestion(toolInput, gameState, playtimeTracker);
-
-      case 'analyze_playtime':
-        return _handlePlaytimeAnalysis(toolInput, playtimeTracker);
-
-      case 'evaluate_lineup':
-        return _handleLineupEvaluation(toolInput, gameState);
-
-      case 'position_recommendation':

… diff truncated …
```

## Cleanup before sharing

**Action required.** Secret-pattern hits: password assign ×8; PII-keyword files: 0. Remove from the working tree AND git history, and rotate any live key before transfer.

*Contains real code excerpts and diff hunks (secret-shaped values redacted). % Rich PRs is a lower bound — review threads live on the code host, not in git. Function and class counts are regex estimates.*