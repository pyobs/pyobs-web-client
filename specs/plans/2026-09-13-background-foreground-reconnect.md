# Plan: Reconnect on background/foreground and on any connection drop

Status: implemented (code landed; real-device verification per below still pending)

Repos: pyobs-web-client (all implementation here)

Design: `specs/design/background-foreground-reconnect.md` (all decisions below are settled there —
this plan is just the sequencing). Issue: pyobs/pyobs-web-client#49.

## Context

Two gaps, fixed together: (1) `Strophe.Status.DISCONNECTED` never triggers a retry once the app is
past its initial page-load `autoReconnect()` (`useXmpp.ts:774`), so any drop — backgrounding-induced
or not — strands the user; (2) no `@capacitor/app` lifecycle listener exists, so foreground resume
never even checks whether the connection survived. Full reasoning in the design doc; not repeated
here.

## Scope

1. **`package.json`** — add `@capacitor/app` (match the `^8.5.1` pin already used for
   `@capacitor/android`/`@capacitor/core`/`@capacitor/push-notifications`).

2. **`useXmpp.ts` — `intentionalDisconnect` flag.**
   - New module-scope `ref<boolean>` (or plain variable, matching `connection`/`connectionGeneration`'s
     existing non-reactive style — this doesn't need to be reactive, nothing renders off it).
   - Set `true` at the top of `disconnect()` (`useXmpp.ts:756`), before it clears `connection`.
   - Cleared (`false`) on entering `connect()` (`useXmpp.ts:698`) — covers both a fresh manual login
     and a reconnect attempt.

3. **`useXmpp.ts` — extract `attemptReconnect()`.**
   - Pull `autoReconnect()`'s body (`useXmpp.ts:774-789`) into a reusable `attemptReconnect(userJid,
     password)`: silent attempt → on failure, wait 1 s → one more attempt, `silent=false` so a
     second failure sets `status`/`errorMessage` same as today (issue #47 behavior, unchanged).
   - `autoReconnect` becomes a thin wrapper (or is removed and its one call site at
     `useXmpp.ts:791-795` calls `attemptReconnect` directly) — no behavior change for the page-load
     path, just a rename/extraction.

4. **`useXmpp.ts` — wire the DISCONNECTED watcher.**
   - In the `connect()` status callback's `Strophe.Status.DISCONNECTED` branch (`useXmpp.ts:747-751`):
     after setting `status.value = 'disconnected'`, if `!intentionalDisconnect` and
     `sessionStorage` still has both `SESSION_JID_KEY`/`SESSION_PW_KEY`, call
     `attemptReconnect(storedJid, storedPassword)`.
   - This alone closes the general "any drop while foregrounded" gap, independent of steps 5-7.

5. **`useXmpp.ts` — XEP-0199 ping probe.**
   - New `pingServer(timeoutMs = 3000): Promise<boolean>` — builds `$iq({ to: domain, type: 'get'
     }).c('ping', { xmlns: 'urn:xmpp:ping' })`, sends via `connection.sendIQ` with both success and
     error callbacks resolving `true` (per the design doc: an XMPP-level error response still proves
     the round trip completed), and a separate `setTimeout(timeoutMs)` that resolves `false` if
     neither callback fired first. **Do not** reuse `sendIQ()` as-is — its `reject`-on-error-IQ
     behavior and fixed 10 s timeout are both wrong here (design doc, "Liveness probe" decision).
   - `domain` = `Strophe.getDomainFromJid(jid.value)`.

6. **New `src/composables/useAppLifecycle.ts`.**
   - `App.addListener('appStateChange', async ({ isActive }) => { … })`, `App` from `@capacitor/app`.
   - Not native-gated (unlike `usePushNotifications.ts`) — `@capacitor/app` has a web implementation,
     and this listener should fire in the Vite web build too.
   - `isActive === false`: no-op (design doc: nothing to proactively do on backgrounding).
   - `isActive === true`:
     - `status.value === 'connected'` → `pingServer()`; `false` → call `attemptReconnect()` with the
       stored credentials (same as step 4's path).
     - `status.value !== 'connected'` (already `disconnected`/`error`) and stored credentials exist
       → call `attemptReconnect()` directly, no probe needed.
   - Exposes an `initialize()` the same shape as `usePushNotifications`' (`initialized` guard so a
     second call is a no-op), and it needs `attemptReconnect`/`pingServer`/`status`/`jid` from
     `useXmpp()` — either import `useXmpp` directly (it's already a singleton-by-module-state
     composable, safe to call from here) or take them as params; match whichever style
     `usePushNotifications.ts` already reads more naturally against (it imports its own deps
     directly, no params) — prefer consistency with that existing composable over inventing a new
     shape.

7. **Wire-up in `App.vue`.**
   - `import { useAppLifecycle } from '@/composables/useAppLifecycle'` alongside the existing
     `usePushNotifications` import; `onMounted(() => useAppLifecycle().initialize())` next to the
     existing `onMounted(() => usePushNotifications().initialize())` (`App.vue:14`).

## Explicitly out of scope

(Mirrors the design doc's "Not in scope" — not re-litigated here.)

- Keeping the socket alive during background.
- Event-history gap-fill across a reconnect (`MAX_EVENTS` ring buffer, no replay).
- Offline RPC queuing.
- Push-notification-driven proactive reconnect.
- Retry backoff / more than two total attempts (design doc: keep `autoReconnect()`'s existing
  two-tries shape).

## Verification

- **Unit-test-reachable pieces**: `intentionalDisconnect` flag behavior (manual `disconnect()` must
  *not* trigger `attemptReconnect` on the subsequent DISCONNECTED callback) and `pingServer()`'s
  resolve/reject/timeout logic are both plain logic — testable, but note `useXmpp.ts` has **no**
  existing spec file/Strophe-mocking harness to build on (confirmed: no `useXmpp.spec.ts` anywhere
  in `src/`, unlike `useServerConfig.ts`/`useVfsConfig.ts`, which do); a real test here means
  standing up that harness from scratch, not extending one. Not done as part of this pass — real
  device testing below is the actual verification for this feature; revisit if regressions in this
  area become a recurring problem.
- **Real-device required** for the actual lifecycle behavior — same device used for prior live
  verification passes (`2026-08-03-telescope-page.md`, `2026-09-09-safe-area-insets.md`):
  - Background the app for a few seconds, foreground it → connection either survives (ping
    succeeds, no visible change) or silently reconnects (ping/status fails → `attemptReconnect`
    fires, no login screen shown unless it genuinely fails twice).
  - Background for long enough that the OS actually kills the socket (device-dependent — likely
    several minutes, or switch to another app + force-stop this one's background process) →
    foreground resume shows silent reconnect, not a stuck "disconnected" state requiring manual
    re-login.
  - Manual logout (`disconnect()` via the UI) must **not** trigger any auto-reconnect — confirms the
    `intentionalDisconnect` flag actually gates step 4/6.
  - Kill ejabberd (or block the WS port) while the app is foregrounded and idle → confirms the
    general DISCONNECTED-watcher path (step 4) fires without needing to background/foreground at
    all.
- **Web build**: confirm `appStateChange` fires on tab visibility change (switch tabs / minimize
  browser) since `@capacitor/app`'s web implementation is Page-Visibility-API-backed — this path
  isn't native-only and should be checked in the regular `npm run dev` build too, not just on
  device.

## Open questions

- None — design doc settled every decision needed to start (probe mechanism/timeout, shared retry
  path, retry count). Flag here if implementation turns up something unanticipated (e.g. `sendIQ`'s
  internal handler bookkeeping not composing cleanly with a second concurrent ping IQ while an RPC
  call is also in flight).
