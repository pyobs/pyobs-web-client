# Native app shell via Capacitor (Android-first, iOS to follow)

Status: proposed

Discussion thread: pyobs/pyobs-core issue #884 — the mobile-app conversation started there and
that history is worth reading, but the decision below is scoped entirely to this repo now; see
"Why not the earlier plan" below.

## Goal

Package this app as an installable native shell for Android and iOS via
[Capacitor](https://capacitorjs.com/), wrapping the existing Vue build rather than rewriting it —
Android first, since that's the primary device in daily use; iOS follows once Android is solid.
Four concrete things this needs to deliver that the plain browser app doesn't today:

1. **Feels like an app**: real icon, splash screen, no address bar/browser chrome, launched from
   the home screen.
2. **Secure, persistent credential storage** — Keychain (iOS) / Keystore-backed encrypted storage
   (Android) instead of the current `sessionStorage`-scoped XMPP password and plaintext
   `localStorage` VFS credentials (see "Credential storage" below).
3. **Push notifications** for alerts that matter while the app isn't open (module `ERROR`
   transitions, bad weather with the roof open, guiding lost, `CRITICAL` log events) — the
   capability that actually justifies a native shell over just using the browser.
4. **An offline-usable start screen**: a list of saved server connections, editable (including
   per-connection VFS-style settings) with zero network — today the app shows nothing useful
   without a live connection, not even its own config screens.

## Why not the earlier plan

`pyobs-core` previously proposed (issue #884; `specs/design/mobile-app-and-shared-ts-client-core.md`,
now superseded, with ADRs 0016–0018) a separate React Native app plus a shared, framework-agnostic
TypeScript protocol core extracted into new repos (`pyobs-js-core`, `pyobs-js-fits`, `pyobs-app`).
Walking through what was actually wanted — installability, secure storage, push, an offline start
screen — none of it needs a new UI framework or a second implementation of the protocol layer.
Capacitor gets all four by wrapping this app as-is: no `pyobs-js-core` extraction, no port off
strophe.js, no new repos. The one thing a WebView genuinely can't provide is true native-widget
feel (native scroll physics, native form controls, interruptible swipe-back gestures); whether that
turns out to matter in practice is explicitly *not* decided here — see "Open questions." If it
does, RN is a real option again, but as a full rewrite decided later with real usage evidence, not
assumed up front.

## Non-goals (for now)

- **Public App Store / Play Store listing.** Distribution is internal-only: Android via direct
  APK / Play internal testing track, iOS via TestFlight (note its 90-day build expiry — needs a
  refresh cadence or ad-hoc/enterprise distribution instead if updates are infrequent).
- **React Native**, or any other from-scratch native rewrite — see "Open questions."
- **Any protocol/wire change.** This is packaging of the existing client; `pyobs-codec.ts` and
  `useXmpp.ts` are unaffected except where noted under Credential storage.

## Architecture

Capacitor is added to this repo, not a new one — this app is already the substantial, independent
codebase its own `specs/index.md` describes itself as, and this is packaging of it, not a new
client family. The app itself lives at repo root today (`src/`, builds to `dist/` via `npm run
build`), with `packages/pyobs-fits` as the one existing workspace package — no `apps/web` split,
unlike the old design doc's assumed layout:

```
pyobs-web-client (this repo)
├── src/            ← existing Vue app, unchanged (still runs standalone in a browser via `vite`)
├── dist/           ← existing build output — becomes Capacitor's webDir directly
├── packages/pyobs-fits/  ← existing workspace package, unaffected
├── ios/            ← new: Capacitor-generated native project
└── android/        ← new: Capacitor-generated native project
```

Capacitor loads the same built `dist/` output into a native WebView per platform; native plugins
(`@capacitor/preferences`/secure-storage, `@capacitor/push-notifications`) bridge the pieces a
browser can't do on its own. No Metro-style monorepo config, no subpath-exports split — it's the
existing build output, wrapped.

## Credential storage

Current state (`specs/design/login-memory-and-vfs-config.md`): the XMPP password lives in
`sessionStorage` (cleared per session, deliberately never persisted — persisting a plaintext
password in `localStorage` was called out there as "a real security regression, not just a style
choice"), while VFS endpoint credentials *are* persisted in `localStorage`, flagged in that same
doc as a named tradeoff. Note that doc is itself marked partially stale: VFS auth has since moved
to a Bearer token (`specs/plans/vfs-token-auth.md`), so it's a token being persisted in plaintext
today, not a password.

Under Capacitor, both move to a secure-storage plugin (Keychain / Keystore-backed encrypted
storage) — a materially stronger trust boundary than either `sessionStorage` or `localStorage`.
This changes the calculus in `login-memory-and-vfs-config.md`: persisting the XMPP password
long-term becomes safe to do, which is the prerequisite for the saved-connections screen below
(no saved-connections list is useful if it can't also remember the password). The VFS token moves
to the same secure store, closing the plaintext-`localStorage` gap named in that doc. This is
implemented once, behind a platform check — falls back to the existing `sessionStorage`/
`localStorage` behavior when running in a plain browser (unchanged for that case).

## Saved connections screen (offline)

There's already three separate local-storage-backed pieces of this: `recentLogins` (bare JIDs
only, no password, `useXmpp.ts`), `useServerConfig.ts`'s per-domain WS overrides (already editable
pre-login — the one existing piece designed to work before a connection exists), and
`useVfsConfig.ts`'s per-account VFS/token settings (currently only reachable post-login, behind
`SettingsView.vue`'s `requiresAuth` gate). What's missing, and what this screen actually adds, is
(a) a unifying "connection profile" concept that ties a JID to its server override and VFS config
as one saved thing instead of three independently-keyed lists, (b) the password itself, remembered
via the secure store above — none of the existing three stores it — and (c) making the whole
profile (not just the server override) editable with zero network, which means VFS/config editing
needs to move out from behind the post-login gate for saved profiles specifically.

Before finalizing the unified shape, check what `pyobs-polaris` already does for saved
connections — it's reported to have something similar. Not necessarily worth making the two
literally interoperable (different platforms, different storage), but worth not inventing an
incompatible mental model if Polaris's already fits.

## Push notifications

`@capacitor/push-notifications` wraps APNs (iOS) and FCM (Android) — real native push either way,
regardless of RN vs. Capacitor. Required regardless of internal-only distribution: APNs access
needs a paid Apple Developer Program account ($99/yr), and Android needs a Firebase project for
FCM. Test this early — it's the capability that actually motivates a native shell over "just use
the browser," so its feasibility should be confirmed before investing further, not left to the end.

Scope of what's worth alerting on carries over from the earlier design's reasoning rather than
being re-derived: module `ERROR` transitions, bad weather with the roof open, guiding lost,
`CRITICAL` log events. No client code runs while the app is fully closed, so threshold/filtering
logic for these needs to live server-side or in a relay, not in the app.

## Handling flaky connections

Not designed here — `pyobs-core`'s `specs/steering/rpc-timeout-command-idempotency.md` is the
cross-client contract for what happens when an RPC to hardware times out ambiguously (never
blind-retry a mutating command, resolve via current state, never queue a control command for
offline replay). This app should follow it like every other pyobs client; mobile networking just
makes hitting the ambiguous case more frequent, it doesn't change the correct handling.

## Phasing

1. Capacitor wrap + Android build pipeline (internal distribution) — get a real device running
   the existing app, unchanged, before adding anything.
2. Secure-storage plugin swap (XMPP password, VFS token) — see Credential storage.
3. Push notification spike (Android/FCM first, matching device priority) — Apple Developer account
   + Firebase project, verify delivery to a backgrounded and a fully-killed app before assuming
   it works.
4. Saved-connections screen (offline CRUD) — check `pyobs-polaris`'s model first.
5. iOS build + TestFlight distribution.
6. Revisit native-widget feel only after real use of the above — not a default next phase.

## Open questions

- **Does WebView feel "good enough"?** Deferred until there's a real Capacitor build to use
  day-to-day. If scrolling/forms/gestures feel wrong in practice, that's the trigger to reopen RN
  as a full rewrite — not before.
- **Saved-connections data model** — pending a look at `pyobs-polaris`'s equivalent.
- Whether the VFS-token secure-storage migration ships in the same effort as the XMPP password one
  or is tracked separately, given `vfs-token-auth.md` already changed that model once recently.

## References

- `specs/design/login-memory-and-vfs-config.md` — current credential storage this doc changes.
- `specs/plans/vfs-token-auth.md` — VFS auth is Bearer-token-based, not username/password.
- `pyobs-core/specs/design/mobile-app-and-shared-ts-client-core.md` and
  `pyobs-core/specs/adrs/0016`–`0018` (all superseded) — the earlier RN/shared-core plan and why
  it changed.
- `pyobs-core/specs/steering/rpc-timeout-command-idempotency.md` — cross-client contract for
  ambiguous RPC outcomes.
- pyobs/pyobs-core issue #884 — original discussion thread.
