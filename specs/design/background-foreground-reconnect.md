# Reconnect on background/foreground and on any connection drop

Status: implemented (code landed via `specs/plans/2026-09-13-background-foreground-reconnect.md`;
real-device verification still pending).

Issue: pyobs/pyobs-web-client#49.

## The problem

Issue #49's framing is "backgrounding tears down the XMPP connection." That's
not quite what happens — there's no code anywhere in `src/` that disconnects
on background, and no `@capacitor/app` `appStateChange` listener exists to
even notice backgrounding. What actually happens is more fundamental:

1. **The OS, not this app, kills the socket.** iOS and Android suspend
   background network activity for a web view within seconds — a WebSocket
   held open by `useXmpp.ts`'s `connection` gets frozen or dropped by the
   platform regardless of anything this app's JS does. "Keep the socket alive
   during background" (the issue's literal ask) isn't achievable from here.
2. **There is no reconnect-on-drop once connected, at all**, background or
   not. `autoReconnect()` (`useXmpp.ts:774`) only ever runs once, at module
   load, gated on stored `sessionStorage` credentials existing
   (`useXmpp.ts:791-795`). Once a session is live, `Strophe.Status.DISCONNECTED`
   just sets `status.value = 'disconnected'` (`useXmpp.ts:747-751`) — nothing
   retries. A native app shell never reloads the page on foreground resume
   (unlike a browser tab that got discarded), so `autoReconnect()`'s one
   trigger point never fires again; the user is stuck showing whatever
   `disconnected` renders as (login screen) until they manually re-enter
   credentials, even though the same credentials are still sitting in
   `sessionStorage`.

Backgrounding is just the most common trigger of (2): resume from background
almost always finds a dead socket, and today nothing notices or fixes it.
Real-world consequence: any transient network blip (foregrounded or not — wifi
handoff, a cellular gap, ejabberd restart) currently strands the user the same
way.

## Design

Two changes, addressing both the specific issue and its general cause
together (decided below):

**1. Make reconnect-on-drop general, not page-load-only.**

- Add an `intentionalDisconnect` flag, set by `disconnect()`
  (`useXmpp.ts:756`) right before it clears `connection`/`status`, cleared on
  the next successful `connect()`. Distinguishes "user chose to log out"
  (never auto-reconnect) from "the socket died out from under us" (should
  auto-reconnect).
- Extract `autoReconnect()`'s retry shape (silent attempt → 1 s wait → one
  more attempt, non-silent so failure surfaces a real error message, per the
  existing issue #47 handling at `useXmpp.ts:780-787`) into a standalone
  `attemptReconnect()` usable from more than one call site.
- Watch for `Strophe.Status.DISCONNECTED` arriving while
  `!intentionalDisconnect.value` and stored credentials still exist in
  `sessionStorage`, and call `attemptReconnect()` from there. This alone fixes
  the general case (any drop while the app is foregrounded and running) and
  is most of what backgrounding needs too, once combined with (2).

**2. Add app-lifecycle awareness via `@capacitor/app`, not currently a
dependency.** New `useAppLifecycle.ts` composable, `App.addListener('appStateChange', ({ isActive }) => …)`.
`@capacitor/app` has a web implementation (backed by the Page Visibility API),
so this listener fires on the Vite web build too, not just the native shell —
same pattern as `usePushNotifications.ts` guarding native-only behavior with
`Capacitor.isNativePlatform()`, except this listener itself is *not*
native-gated, only what it triggers matters.

- On `isActive: true` (foreground resume): a WS that Strophe still reports as
  `connected` may actually be dead (the OS can invalidate the socket without
  ever delivering a close event the JS side observes promptly) — so resume
  can't just trust `status.value`. Send a short-timeout liveness probe (a
  trivial IQ — e.g. disco#info to the server itself, reusing `sendIQ()`,
  timeout a few seconds) whenever `status.value === 'connected'`; on
  timeout/failure, treat it as a drop and call `attemptReconnect()` from (1).
  If `status.value` is already `'disconnected'`, call it directly, no probe
  needed.
- On `isActive: false` (backgrounded): no action. Nothing to proactively shut
  down — the OS decides the socket's fate, and (1)+the resume probe handle
  cleanup after the fact.

Net effect: whether the connection died from backgrounding, a network blip,
or an ejabberd restart, the app notices (via the DISCONNECTED status watcher,
or via the resume liveness probe) and retries automatically using the
credentials already in `sessionStorage`, silently at first, surfacing an error
only if that retry also fails — matching the existing issue #47 pattern
instead of inventing a new one.

## Not in scope

- Keeping the socket itself alive while backgrounded — not controllable from
  JS given OS background-network suspension; see above.
- Reconciling state/event gaps across a reconnect. Module discovery and state
  subscriptions already re-fetch fresh on every `connect()`
  (`fetchModuleInfo`, `subscribeWithRetry`), so current state is naturally
  correct after a reconnect — but the `events` ring buffer
  (`MAX_EVENTS = 500`) has no replay/gap-fill mechanism; events published
  while disconnected are simply gone from the client's history. Not addressed
  here.
- Queuing RPC calls made while disconnected for replay on reconnect — a call
  made against a dead connection fails now (`executeMethod` throws if
  `!connection`) and will continue to fail; no offline queue.
- Push-notification-driven wake (using `@capacitor/push-notifications`,
  already a dependency per `native-app-shell-capacitor.md`, to reconnect
  proactively on a server-sent push rather than waiting for the user to
  foreground the app) — a reasonable future extension, not needed to close
  #49.

## Decided

Confirmed with the user, 2026-09-13:

- **Deliverable order: design doc first**, before any implementation.
- **Scope: fix the general "no auto-reconnect on drop" gap together with the
  backgrounding case**, not backgrounding alone — they share one root cause
  and one fix.
- **Resume/retry policy: silent retry first, surface only on failure** —
  mirrors the existing `autoReconnect()` shape (silent attempt, 1 s wait, one
  more non-silent attempt) rather than showing a "reconnecting..." indicator
  immediately on every resume.
- **Liveness probe: XEP-0199 ping (`jabber:iq:ping`), 3 s timeout.** New wire
  surface for this client — nothing today builds a `jabber:iq:ping` IQ.
  Addressed to the server domain itself (not the user's own JID), so no
  pyobs-core participation is required; whether it succeeds *or* comes back
  as an XMPP-level error (e.g. `service-unavailable` if ejabberd's `mod_ping`
  isn't loaded), both count as "alive" — only a bare timeout with no response
  at all means the socket is actually dead. `sendIQ()`'s promise rejects on
  an error IQ too, so the probe's alive/dead check must treat *any*
  resolve-or-reject as alive, and only its own `setTimeout` firing first as
  dead — can't reuse `sendIQ()`'s built-in 10 s IQ timeout as-is for that
  reason (also too long for a "user is staring at the screen" probe; needs
  its own 3 s timer).
- **One shared `attemptReconnect()`** for both the general DISCONNECTED-status
  watcher and the resume-probe path — no separate faster/slower variant for
  resume.
- **Retry count: keep `autoReconnect()`'s existing shape** — two total
  attempts, 1 s apart, no backoff. Revisit only if real usage shows it's
  insufficient.
