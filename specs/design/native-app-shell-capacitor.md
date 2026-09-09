# Native app shell via Capacitor (Android-first, iOS to follow)

Status: in progress. Goals 1 (icon/splash/no browser chrome), 2 (XMPP password and VFS endpoint
tokens both secure-storage-backed now, see Credential storage), and 4 (offline saved-connections
screen, built further than described below) are done. Goal 3 (push) is **done**: end-to-end
delivery confirmed on a real device against a real Firebase project (see "Push notifications"
below).
Forward evolution of the
UI built here — the compact shell, Dashboard, and the Connections/Add/Edit split — is tracked in
`specs/plans/2026-09-06-mobile-first-redesign.md`, not this doc.

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
choice"). That doc is marked partially stale for a different reason it names — a Bearer-token
migration for VFS auth — which has since shipped: `specs/plans/2026-08-04-vfs-token-auth.md` is
now `status: done`, VFS endpoints use `Authorization: Bearer <token>`, not Basic Auth
username/password.

**Implemented: both the XMPP password and the VFS token are secure-storage-backed.**
`useCredentialStore.ts` wraps `@aparajita/capacitor-secure-storage` (Keychain / Keystore-backed)
for both — opt-in "Remember password" on login for the XMPP password, or set directly from the
Connections Add/Edit screens; the VFS token is entered per-endpoint in that same screen
(`SettingsView.vue`/`EditConnectionView.vue`), never round-tripped back into the form once saved
(blank means "leave unchanged", same as the XMPP password field). The one-credential-type-secure/
one-plaintext inconsistency this section used to flag no longer exists — root/baseUrl (not secrets)
are the only VFS fields still in plain `localStorage`.

## Saved connections screen (offline) — implemented, shape evolved past this description

Built as three views rather than one screen: `ConnectionsView.vue` (the app's start screen — a
card list, tap to connect, "⋯" to edit, a FAB to add), `EditConnectionView.vue` (per-domain
secure-WebSocket toggle, VFS endpoint CRUD, password, "Remove connection"), and a bottom-sheet Add
flow. The three previously-separate stores this section originally described
(`recentLogins`/`useServerConfig`/`useVfsConfig`) stayed separate underneath — "unifying" them
turned out to mean "one screen drives all three," not one merged data store — plus the password
itself, settable directly from Add or Edit (stored unverified, no live connect attempt, since
requiring network just to save a profile would defeat the offline-usability point). See
`specs/plans/2026-09-06-mobile-first-redesign.md` for how this continued to evolve (the Connections/Login
flow section there).

**Never done: checking `pyobs-polaris`'s equivalent first**, as this section originally called
for. The shape above was built without that comparison — not necessarily wrong, but an open risk
this doc flagged and the implementation skipped, not resolved.

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

**2026-09-09: scoped as a new pyobs-core module**, not the XEP-0357/ejabberd relay this section
originally implied — see `../pyobs-core/specs/design/push-notification-module.md`. Confirmed the
wire-protocol prerequisite ("keep these distinguishable on the wire") is already satisfied by
existing code, so nothing here needed a wire change after all. v1 there covers module `ERROR`
only. The one change this repo will need once that module exists: `usePushNotifications.ts` calls
its device-registration RPC once a token is obtained, closing the gap its own comment already
flags ("associating a token with an account server-side is a later, not-yet-designed step").

## Handling flaky connections

Not designed here — `pyobs-core`'s `specs/steering/rpc-timeout-command-idempotency.md` is the
cross-client contract for what happens when an RPC to hardware times out ambiguously (never
blind-retry a mutating command, resolve via current state, never queue a control command for
offline replay). This app should follow it like every other pyobs client; mobile networking just
makes hitting the ambiguous case more frequent, it doesn't change the correct handling.

## Phasing

1. ✅ Capacitor wrap + Android build pipeline (internal distribution) — a real device runs the
   app; also needed a project-relative debug keystore fix (see
   `specs/plans/2026-09-06-mobile-first-redesign.md`'s "Incidental fixes") once Android Studio and the CLI
   turned out to sign debug builds differently on this dev machine.
2. ✅ Secure-storage plugin swap — **XMPP password and VFS token both migrated**; see Credential
   storage above.
3. ✅ Push notification spike — **done, end-to-end delivery confirmed** on a real device (Motorola
   Edge 50 Neo, Android 16) against a real Firebase project (`pyobs-51a29`). `@capacitor/push-notifications` installed,
   `src/composables/usePushNotifications.ts` (permission request + `register()` + listeners,
   native-only, no-op on web), wired from `App.vue` on mount, a diagnostic panel in
   `SettingsView.vue` (token/error/last-received). `npx cap sync android` already added the
   plugin's Gradle project reference, and — corrected from an earlier, overcautious note in this
   doc — the Capacitor Android template *already* guards `apply plugin:
   'com.google.gms.google-services'` behind a `google-services.json` existence check
   (`android/app/build.gradle`), so that plugin was never actually at risk of breaking the build.

   **Real bug found and fixed by testing on-device**: calling `PushNotifications.register()`
   without a configured Firebase project doesn't fail gracefully — it's an uncaught
   `IllegalStateException` ("Default FirebaseApp is not initialized") on a Capacitor plugin thread,
   crashing the whole app on launch. Not reachable from any JS `try`/`catch`, confirmed via
   `adb logcat`'s crash buffer. Fixed with a build-time flag: `vite.config.ts` checks whether
   `android/app/google-services.json` exists and injects `__PUSH_NOTIFICATIONS_CONFIGURED__`
   (same pattern as `__APP_VERSION__`); `usePushNotifications.ts` skips the entire flow — permission
   prompt included, since it unlocks nothing yet — until that's `true`. Rebuilt, reinstalled, and
   relaunched on the same device: no crash, diagnostic panel shows "not configured" as expected.

   **Firebase project created and end-to-end delivery confirmed.** `google-services.json` for
   project `pyobs-51a29` (app id `org.pyobs.app`) dropped into `android/app/`; rebuilt, reinstalled
   — `FirebaseApp initialization successful`, `register()` returned a real FCM token, no crash.
   A Firebase Console campaign (Messaging → Kampagnen; note "Neue Kampagne" evaluates an audience
   and can take a couple of minutes to actually send, unlike the instant single-device "Neuer
   Test" — a campaign showing "Gesendet: 0" right after creating it is normal, not stuck) delivered
   a real notification to the device; tapping it fired `pushNotificationActionPerformed` with a
   real `RemoteMessage` payload, confirmed via `adb logcat`. `android/app/google-services.json` is
   currently untracked in git (not yet decided whether to commit it or gitignore it per-developer).

   **Local build-environment notes, in case another machine hits the same wall**: this needs a
   *complete* Android SDK platform (a partial/corrupted auto-download of "Android SDK Platform 36"
   was missing `android.jar` entirely — delete `~/Android/Sdk/platforms/android-36` and let Gradle
   redownload it if `compileDebugJavaWithJavac` fails with an opaque
   `MissingValueException: Cannot query the value of this provider because it has no value
   available`), and a **full JDK 21+ with `jlink`** (`@capacitor/android`'s `sourceCompatibility` is
   21; a JetBrains-IDE-bundled JBR can be missing `jlink`, which fails only at the
   `core-for-system-modules.jar` transform step, downstream of everything else succeeding —
   `openjdk-21-jdk-headless` from apt works fine). iOS side (APNs, paid Developer Program account)
   not started at all.
4. ✅ Saved-connections screen (offline CRUD) — done, shape described above; `pyobs-polaris`'s
   model was never checked (see that section).
5. iOS build + TestFlight distribution — not started, blocked on Mac access.
6. Revisit native-widget feel only after real use of the above — not decided either way yet;
   real use since has included a first-hand dev-workflow comparison with RN (liked its live-reload
   loop) without deciding to switch — see `specs/plans/2026-09-06-mobile-first-redesign.md`'s history for
   that discussion.

## Open questions

- **Does WebView feel "good enough"?** Still open. The mobile-first redesign (see that plan) is
  the real-use test this was waiting on, but it hasn't produced a verdict either way yet — it's
  been about layout and information architecture, not a judgment on WebView feel itself.
- **Saved-connections data model vs. `pyobs-polaris`** — still unchecked; the screen shipped
  without this comparison ever happening.

## References

- `specs/plans/2026-09-06-mobile-first-redesign.md` — where the UI built here (compact shell, Dashboard,
  Connections/Add/Edit) continues to evolve; the current source of truth for that, not this doc.
- `specs/design/login-memory-and-vfs-config.md` — current credential storage this doc changes.
- `specs/plans/2026-08-04-vfs-token-auth.md` — proposed Basic Auth → Bearer token migration for VFS auth;
  still `status: proposed`, not executed — VFS auth is still username/password today.
- `pyobs-core/specs/design/mobile-app-and-shared-ts-client-core.md` and
  `pyobs-core/specs/adrs/0016`–`0018` (all superseded) — the earlier RN/shared-core plan and why
  it changed.
- `pyobs-core/specs/steering/rpc-timeout-command-idempotency.md` — cross-client contract for
  ambiguous RPC outcomes.
- pyobs/pyobs-core issue #884 — original discussion thread.
