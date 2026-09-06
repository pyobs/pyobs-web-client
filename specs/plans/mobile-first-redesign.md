# Plan: Mobile-first redesign of the app shell and views

Status: proposed, not yet started

Repos: pyobs-web-client (all implementation here)

## Context

Following the decision to consolidate on this repo as the one non-`pyobs-gui` client to maintain
going forward (packaged for Android/iOS via Capacitor — see
`specs/design/native-app-shell-capacitor.md`), a working Capacitor build exists and has been
tested on a real Android device. What's running today is a desktop-first design (sidebar nav,
Bootstrap dark theme) squeezed to fit a phone screen — functional, but confirmed (by using it) to
not feel like "a real app." The wide-screen/desktop layout itself is **not** the problem and is
explicitly kept as-is; the gap is specifically the narrow-width experience.

Working principle, agreed while scoping this: adapt by **window width, on a continuum**, not by
device category. Below a breakpoint, the app gets its own compact shell (bottom navigation,
single-column, touch-first density); at or above it, today's sidebar and information density stay
unchanged. A tablet lands wherever its actual on-screen width places it — this is not a
phone/tablet/desktop three-way split, it's one shell that switches at one width threshold. This
matches the breakpoint approach already floated in the (now superseded) original mobile-app design
doc, and this repo's own standing "every design must work on mobile and desktop" constraint
(`DEVELOPMENT.md`), now applied deliberately to the compact end instead of just "doesn't break."

## Non-goals

- **No framework change.** Stays Vue/Capacitor — see `native-app-shell-capacitor.md` for why RN/
  Flutter/Qt were considered and set aside.
- **No changes to the wide-screen/desktop layout.** Confirmed acceptable as-is; only the compact
  shell is new.
- **No iOS-specific fixing yet** — blocked on Mac access (own machine or a cloud Mac CI runner).
  Folded in as Phase 4 once available; the shared Vue/CSS work in Phases 0–3 is what iOS runs on
  too, so this is verification and quirk-fixing, not a second redesign.
- **No push notifications, no biometric re-auth** — out of scope for this plan. Biometric re-auth
  before issuing control commands was raised while scoping the original mobile design and never
  resolved; revisit as an explicit decision in Phase 3, not assumed in or out.
- **No assumption that every existing view ships on mobile unchanged.** Phase 2 is an explicit
  per-view audit, not an automatic 1:1 port.

## Phase 0 — Design direction (mockup pass)

Before any Vue code changes: mock up the compact-width shell — bottom navigation + Dashboard +
one dense view (Camera, as the most complex existing view) — as a design artifact to agree on
visual language (spacing, typography, tap targets, iconography, transitions) and interaction
patterns before committing to it across every view. Cheaper to iterate on a mockup than on 13 live
components.

**Decides:** the compact shell's visual language; which destinations get a primary bottom-nav tab
vs. tucked under a "More" entry (destination count likely exceeds a comfortable tab bar — Shell,
Settings, and several device-specific pages don't all fit as top-level tabs).

## Phase 1 — Breakpoint infrastructure

- `useBreakpoint.ts`: a reactive, width-based breakpoint composable (reuse the ~600dp convention
  named in the superseded mobile design doc, unless Phase 0 suggests a different threshold).
- Restructure `AppLayout.vue` to swap chrome — existing sidebar vs. new compact shell (bottom nav
  + top bar) — around the same `<RouterView>`, based on the breakpoint. View components
  themselves don't fork; only the surrounding shell does, except where Phase 2 calls for an
  actual per-view compact redesign.
- New compact navigation component per Phase 0's destination set.

## Phase 2 — Per-view audit and migration

For each existing view — `DashboardView`, `ShellView`, `RoofView`, `ModeView`, `WeatherView`,
`AutoFocusView`, `AutoGuidingView`, `AcquisitionView`, `CameraView`, `LoggingView`, `EventsView`,
`SettingsView`, plus the Login/Connections flow — decide explicitly: keep as-is behind the
breakpoint switch, redesign for the compact shell, or descope from primary mobile navigation
(still reachable, just not a top-level destination).

- `LoggingView`/`EventsView` already got a narrow-width layout fix this session (table → flowing
  list) — re-check against Phase 0's visual language once it exists, not just "doesn't overflow."
- The Connections/Login flow already is the compact landing experience built this session —
  re-check visually against Phase 0's language; functionally it stays.
- `ShellView` (raw RPC/method console) is the most likely candidate for "descope from primary
  nav, keep reachable" — flag for an explicit decision, don't assume either way.

Migrate incrementally, each view landing as its own reviewable change. Suggested order (highest
real-world phone use first): Dashboard → Camera → Roof/Mode/Weather → Logging/Events →
Connections/Settings → Shell/AutoFocus/AutoGuiding/Acquisition.

## Phase 3 — Cross-cutting polish

- Haptic feedback (`@capacitor/haptics`) on key actions — confirm-style commands (open dome, abort
  exposure) were flagged earlier as the concrete case for this.
- Safe-area inset handling (status bar / gesture nav) — an Android concern now, doubles as iOS
  prep for Phase 4.
- Keyboard-avoidance check on every numeric/text form (exposure time, RA/Dec, filter selection) —
  a known WebView pain point named earlier in this design's history.
- **Decide** (not pre-committed): biometric re-auth gate before control commands, given the app
  can now remember passwords (`useCredentialStore.ts`) and a lost/unlocked phone could otherwise
  issue commands to hardware freely.

## Phase 4 — iOS pass (blocked on Mac access)

Run the same shell and views on real WKWebView (simulator or device) once Mac access exists —
fix safe-area/keyboard/scroll-physics quirks specific to iOS's WebView. Not a redesign: Phases
0–3's Vue/CSS work already covers iOS; this is verification and targeted fixes only.

## Open questions

- Compact-nav destination set — resolved in Phase 0.
- Exact visual language (a real design system vs. restyled Bootstrap) — resolved in Phase 0, not
  pre-decided here.
- Biometric re-auth — resolved in Phase 3.
- Whether `ShellView` stays in primary mobile navigation — resolved in Phase 2.

## References

- `specs/design/native-app-shell-capacitor.md` — why Vue/Capacitor, not a rewrite.
- `pyobs-core/specs/design/mobile-app-and-shared-ts-client-core.md` (superseded) — origin of the
  breakpoint-adaptive-layout idea this plan reuses.
- `DEVELOPMENT.md` — this repo's standing "mobile and desktop" constraint.
