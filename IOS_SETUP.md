# CoachIQ — iOS app setup

This turns the existing React app into a self-contained iPhone app you open and
run from Xcode. It runs **fully on-device** (no backend, no hosting cost): the
data layer, live game, stats, and dashboard all work offline. Multi-coach sync
runs **peer-to-peer over Bluetooth / local WiFi**. The AI Line Coach calls a tiny
**serverless proxy** that holds your Anthropic key.

---

## What changed (high level)

- **Capacitor** wraps the React build into a real Xcode project. Web assets are
  bundled in the app (not loaded from a URL), so it's offline-first and App
  Store-compliant.
- **Standalone data layer** (`frontend/src/local/`): an on-device IndexedDB store
  + an axios adapter that fulfils every API call locally. No screen changed —
  they still call `apiClient`. First launch seeds a demo **Lakewood Warriors**
  team so the app opens to real data.
- **Multipeer plugin** (`frontend/capacitor-multipeer/`): native Swift wrapping
  Apple's MultipeerConnectivity (Bluetooth + local WiFi). Host-authoritative —
  the head coach's phone is the source of truth; assistants join and mirror it.
- **AI proxy** (`ai-proxy/`): a Cloudflare Worker holding your Anthropic key.

---

## Prerequisites (on your Mac)

- **Xcode 16+** with command-line tools, and an Apple Developer account for
  signing.
- **CocoaPods**: `sudo gem install cocoapods` (or `brew install cocoapods`).
- **Node 20+**.

---

## First-time build

```bash
cd "CoachIQ/frontend"

npm install                 # installs Capacitor + the local Multipeer plugin
npm run build:ios           # builds the web bundle in standalone mode
npx cap add ios             # generates the Xcode project (runs pod install)
npm run ios:assets          # renders the branded app icon + splash into iOS
npx cap sync ios            # copies web build + native plugins into the project
npx cap open ios            # opens Xcode
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities** → choose your Team and
   set a unique **Bundle Identifier** (default is `com.coachiq.app`; change it to
   one you own, e.g. `com.yourname.coachiq`). Keep it in sync with
   `frontend/capacitor.config.json` → `appId`.
2. **General** → set **Minimum Deployments** to **iOS 14.0** if it isn't already.
3. Add the multi-coach permission strings (see next section).
4. Pick a simulator or your plugged-in iPhone and hit **Run** (⌘R).

### Rebuilding after code changes

```bash
cd "CoachIQ/frontend"
npm run ios:sync     # rebuild web + copy into iOS
# then press Run in Xcode  (or: npm run ios  to rebuild, sync, and open Xcode)
```

---

## Multi-coach permissions (required for Bluetooth / WiFi sync)

Add these to `ios/App/App/Info.plist` (Xcode: target → **Info** tab, or edit the
file directly). Multipeer is rejected silently without them.

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>CoachIQ connects to nearby coach devices to share live game stats.</string>
<key>NSBluetoothAlwaysUsageDescription</key>
<string>CoachIQ uses Bluetooth to connect nearby coach devices during games.</string>
<key>NSBonjourServices</key>
<array>
  <string>_coachiq-lax._tcp</string>
  <string>_coachiq-lax._udp</string>
</array>
```

> **Multipeer only works on real hardware.** The iOS Simulator cannot do
> Bluetooth/peer-WiFi. Test multi-coach on **two or more physical iPhones** on
> the same WiFi or in Bluetooth range.

---

## Turn on the AI Line Coach (optional)

The app ships with AI **off** until you deploy the proxy. See
[`ai-proxy/README.md`](ai-proxy/README.md). Short version:

```bash
npm install -g wrangler
cd ai-proxy
wrangler login
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put APP_CHECK_TOKEN
wrangler deploy            # prints https://coachiq-ai.<you>.workers.dev
```

Then set `REACT_APP_AI_PROXY_URL` in `frontend/.env` to that URL and rebuild.
Cost controls (Haiku model, token cap) are already wired; the README explains the
levers.

---

## App Store readiness

- **Guideline 4.2 (minimum functionality):** A Capacitor app passes when it has
  real native value beyond a website. CoachIQ clears this easily — offline data,
  a live game engine, Bluetooth multi-coach. Lead the review notes with those.
- **Privacy strings:** the Local Network + Bluetooth descriptions above are
  required. In App Store Connect, declare Local Network and Bluetooth usage.
- **App Attest (before public launch):** the AI proxy currently gates on a shared
  token. For a public release, finish App Attest (native `AppAttest` plugin +
  `verifyAppAttest()` in the Worker) so only your real app can call the proxy.
- **Orientation:** the UI was built tablet-first (landscape). On iPhone it runs,
  but review the live-game screen in portrait and decide whether to lock
  orientation (Xcode → target → General → Device Orientation).
- **Icon:** generated from `frontend/resources/icon.png` (opaque, no alpha — Apple
  rejects transparent icons).
- **ATS:** all network calls are HTTPS (the AI proxy), so no ATS exceptions
  needed.

---

## What's verified vs. needs your testing

**Verified** (ran an automated end-to-end pass over the on-device backend):
seeding, roster + computed season stats, dashboard record/equity, lines and
suggestions, position-fit, and a full live game — start, clock, log events,
score, substitution, sub-queue, playtime, end — plus season-date validation. A
substitution-order bug (inherited from the old server code) was found and fixed.

**Needs on-device testing / likely iteration:**

- **Multipeer multi-coach** — the native plugin, transport, and host/guest wiring
  compile and are in place, but peer-to-peer can only be exercised on two real
  devices. Expect to refine the guest join UX (entering the room code, navigating
  the assistant into the hosted game) during that testing.
- **AI proxy** — deploy it, then confirm the Line Coach round-trip and tune the
  prompt/token cap to taste.
- **Full UI walkthrough** on a phone — the screens were built for a tablet; some
  may want responsive polish on a narrow iPhone screen.
