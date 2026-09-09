# Plan: Keyboard-avoidance on text/number forms

Status: implemented, not yet live-verified. **2026-09-09: Step 0 confirmed real** by Tim
(keyboard does hide focused inputs) — went straight to option A (global `focusin` listener,
`useKeyboardAvoidance.ts`, wired into `App.vue`). Type-checks and builds clean. Real-device
verification (per "Verification" below) still pending; fall back to option B
(`@capacitor/keyboard`) only if A doesn't hold up on-device.

Repos: pyobs-web-client (all implementation here)

## Context

Split out of `specs/plans/2026-09-06-mobile-first-redesign.md` Phase 3 as its own scoped plan.
That plan called this "a known WebView pain point," but that phrasing came from the same
commit (`0f536a6`) as the now-struck biometric-reauth item, whose "raised while scoping" framing
turned out to have no real backing — so treat "known pain point" here with the same skepticism.
**This has not been confirmed to actually happen on this app** — Android's default
`windowSoftInputMode` behavior, or the WebView's own handling, may already be adequate.

Confirmed against the code (2026-09-09):

- No `android:windowSoftInputMode` is set on `MainActivity` in `android/app/src/main/AndroidManifest.xml`
  (falls back to the system default, `adjustUnspecified`).
- `@capacitor/keyboard` is not installed (`package.json` has no entry for it) — no plugin-level
  keyboard resize handling exists today.
- The app just went edge-to-edge for `2026-09-09-safe-area-insets.md` (Capacitor 8 default,
  `targetSdkVersion 36`). This matters here too: edge-to-edge apps on Android don't reliably get
  the classic `adjustResize` pan/resize behavior for free — the WebView already occupies the full
  window, so nothing tells it to shrink for the IME unless something explicitly listens for
  IME window insets (native) or `visualViewport` resize (web).
- Two shared form components carry most of the actual text/number input surface: `ParamForm.vue`
  (generic RPC param form — Shell commands and most control-widget actions, likely including
  exposure time / RA-Dec / filter-selection params depending on the module's interface) and
  `StructConfigForm.vue` (`IStructuredConfig` widget). A handful of views also have their own
  standalone inputs outside those two: `AutoFocusView.vue`, `AutoGuidingView.vue`, `CoolingView.vue`,
  `FocuserView.vue`, `SpectrographView.vue`, `TelescopeView.vue`, `VideoGrabView.vue`, `VideoView.vue`,
  plus `LoginView.vue`/`ConnectionsView.vue`/`EditConnectionView.vue`/`SettingsView.vue` (not
  control-related, but same input surface).

## Step 0 — Reproduce first (blocks everything else)

On the real Android device, with the compact shell, open a view with an input low on the screen
(e.g. `TelescopeView`'s RA/Dec entry, or `ParamForm`'s param inputs on a Shell command near the
bottom of a long form) and confirm the keyboard actually covers the focused field instead of the
page panning/scrolling to keep it visible. If the default behavior already handles this
acceptably, this plan closes as "not needed," same outcome as haptics/biometric.

## If confirmed — two candidate fixes (decide after Step 0, don't pre-commit)

**A. JS-only, no new dependency.** A single global `focusin` listener (mounted once, e.g. in
`App.vue` or a small composable) that calls `scrollIntoView({block:'center', behavior:'smooth'})`
on any focused `input`/`textarea`/`select`. Covers every current and future input automatically —
no per-view or per-component changes needed, so it doesn't require touching `ParamForm.vue`,
`StructConfigForm.vue`, or any of the standalone-input views individually. Weaker guarantee: relies
on the browser/WebView still reporting reasonable layout viewport dimensions once the IME opens;
may not be enough on its own if the WebView doesn't resize *at all* under edge-to-edge.

**B. `@capacitor/keyboard` native plugin.** Install it, configure a resize mode
(`KeyboardResize.Native` or `.Body`) in `capacitor.config.ts`. Handles the Android-edge-to-edge/IME
interaction at the platform level rather than papering over it in JS. New dependency, native
project change, needs a full rebuild to test (not just a web reload).

Preference if both would work: **A first**, since it's smaller and this app's precedent
(`specs/plans/2026-09-09-safe-area-insets.md`) is to prefer CSS/JS-only fixes when they're
sufficient. Fall back to B only if A doesn't actually solve it on-device.

## Explicitly out of scope

- iOS — Phase 4, blocked on Mac access, per the parent plan.
- Any visual/layout redesign of the affected forms — this is purely about the field staying visible
  while typing, not restyling.

## Verification

- Real Android device, compact shell, gesture nav (same device/setup as the safe-area-insets plan).
- Test at minimum: `TelescopeView` RA/Dec entry, one `ParamForm`-driven Shell command, one
  `StructConfigForm` field — covers the two shared components plus a standalone-input view.
