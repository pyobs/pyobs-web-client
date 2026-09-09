# Plan: Safe-area inset handling (status bar / gesture nav)

Status: proposed

Repos: pyobs-web-client (all implementation here)

## Context

Split out of `specs/plans/2026-09-06-mobile-first-redesign.md` Phase 3 as its own scoped plan.

Confirmed against the code (2026-09-09): `AppLayout.vue`'s compact shell has a fixed-height top bar
(`height:56px`) and a bottom tab bar with a hardcoded `padding-bottom:10px`, neither aware of
device insets. `ConnectionsView.vue`'s FAB is `position:fixed; bottom:28px`, also hardcoded. None
of them account for the status bar or the Android gesture-nav bar.

This isn't hypothetical for this app specifically:

- `android/app/src/main/java/org/pyobs/app/MainActivity.java` is a bare `BridgeActivity` with no
  overrides, and Capacitor is on `8.5.1` (`package.json`) — Capacitor 5+ defaults to edge-to-edge
  on Android (`WindowCompat.setDecorFitsSystemWindows(false)`), so the WebView already draws behind
  the status bar and gesture-nav bar today.
- `android/variables.gradle` has `targetSdkVersion = 36` — past API 35, where Android removed the
  ability to opt out of edge-to-edge altogether. Disabling edge-to-edge (e.g. via
  `@capacitor/status-bar`'s `overlaysWebView: false`, which also isn't installed —
  `@capacitor/status-bar` doesn't appear in `package.json`) is not a durable fix here; respecting
  `env(safe-area-inset-*)` in CSS is the only approach that keeps working going forward.
- `index.html`'s viewport meta is `width=device-width, initial-scale=1.0` — no `viewport-fit=cover`.
  Without it, a WebView reports `env(safe-area-inset-*)` as `0px` even though it's drawing
  edge-to-edge, so the insets below are inert until this is added first.

## Scope

1. **`index.html`** — add `viewport-fit=cover` to the viewport meta tag. Prerequisite for
   everything else; without it the `env()` values below are always zero.
2. **`AppLayout.vue` compact-shell top bar** — add `padding-top: env(safe-area-inset-top)` (additive
   to the existing 56px content height, not replacing it) so the logo/back-button/settings row
   clears the status bar instead of sitting under it.
3. **`AppLayout.vue` compact-shell bottom tab bar** — change the hardcoded `padding-bottom:10px` to
   `padding-bottom: max(10px, env(safe-area-inset-bottom))`, so it still has its current 10px on
   3-button-nav devices/browsers but grows to clear a gesture-nav bar where present.
4. **`ConnectionsView.vue` FAB** — change `bottom:28px` to
   `bottom: max(28px, env(safe-area-inset-bottom))`.
5. **`ConnectionsView.vue` add-connection bottom sheet** — check padding/safe-area on its own
   bottom edge too (currently `position:fixed; inset:0`, sheet content anchored to the bottom);
   likely needs the same `max(..., env(safe-area-inset-bottom))` treatment on its inner padding so
   the sheet's bottom row (last input / action button) doesn't sit under the gesture-nav bar.
6. **Re-audit for other fixed-position/bottom-anchored elements** after the above land — this pass
   only found `AppLayout.vue` and `ConnectionsView.vue` via
   `grep -rln "position: fixed\|position:fixed\|bottom: 0\|bottom:0" src/`, but that's a narrow
   pattern; a broader look (any `position: fixed` regardless of which edge, any modal/sheet/toast)
   should happen once these two are fixed, in case something was missed.

## Explicitly out of scope

- **Desktop/wide-screen sidebar layout** — untouched, per this plan's parent's own non-goal ("no
  changes to the wide-screen/desktop layout").
- **iOS-specific insets** — Phase 4 (`specs/plans/2026-09-06-mobile-first-redesign.md`), blocked on
  Mac access. The `env(safe-area-inset-*)` CSS added here is shared groundwork (iOS Safari/WKWebView
  supports the same properties) but iOS-specific verification (notch, home indicator) happens there,
  not in this plan.
- **`@capacitor/status-bar` plugin** — not adding it. Nothing here needs status bar color/style
  control, just inset-aware layout.

## Verification

- Real Android device (same one used for `2026-08-03-telescope-page.md`'s live verification).
- Must be tested with **gesture navigation** enabled specifically, not 3-button nav — gesture nav is
  the default on modern Android and is what actually exercises the bottom-inset case; 3-button nav
  reserves its own space and may mask a regression. If convenient, check both nav modes.
- Confirm: top bar content fully clears the status bar; bottom tab bar and FAB fully clear the
  gesture-nav bar; add-connection sheet's bottom row is tappable and not obscured.

## Open questions

- None currently — scope above is small and mechanical (CSS-only, no new dependencies). Flag here
  if the re-audit step (item 6) turns up something that needs its own design decision.
