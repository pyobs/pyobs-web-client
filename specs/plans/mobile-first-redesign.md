# Plan: Mobile-first redesign of the app shell and views

Status: in progress — Phase 1 implemented; Dashboard and the Connections/Login flow migrated
(Phase 2, partial). Remaining Phase 2 views, Phase 3, and Phase 4 not started.

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

## Phase 0 mockups (snapshot 2026-09-06)

Static PNGs of the design-canvas mockup, checked in since the canvas itself lives outside this
repo: `mobile-first-redesign/connections.png` (app start screen), `add-connection.png`,
`edit-connection.png`, `dashboard.png` (status/triage board), `logs.png` (module + level filters),
`module-page.png` (module-grouped drill-down, tabs per interface — mirrors `pyobs-gui`'s
`ModulePage`), `more.png` (Events/Shell/Settings & Connections only — every actual module is
reached via Dashboard, not listed here). Point-in-time snapshot of the direction as agreed, not
living documentation — the canvas may have moved on since.

## Phase 1 — Breakpoint infrastructure ✅ implemented

- `useBreakpoint.ts`: reactive, width-based (`isCompact` at ≤991.98px) — reuses this app's
  existing Bootstrap `lg` breakpoint (`main.css`'s old mobile-drawer media query) rather than the
  ~600dp figure the superseded mobile design doc had floated, so the JS-driven compact shell and
  the desktop sidebar's own CSS agree on one threshold instead of two.
- `AppLayout.vue` now branches on `isCompact`: compact renders a bottom-tab shell (top bar with
  the real pyobs logo + a settings icon, `<RouterView>`, bottom nav), desktop renders the
  unchanged sidebar. `useModuleNavSections.ts` was extracted from `AppLayout.vue` so the compact
  shell's `MoreView.vue` can reuse the same per-interface grouping instead of duplicating it.
- Actual destination set (settled by discussion, not Phase 0's original 4-tab guess of
  Dashboard/Camera/Activity/More): **Dashboard, Logs, More** — three tabs, not four. Camera lost
  its tab entirely once the discussion corrected the whole approach to be module-grouped, not
  interface-grouped (see Phase 2 below); Logs earned a primary tab because filtered monitoring,
  not module control, is this shell's actual primary job.

## Phase 2 — Per-view audit and migration (partial)

For each existing view — `DashboardView`, `ShellView`, `RoofView`, `ModeView`, `WeatherView`,
`AutoFocusView`, `AutoGuidingView`, `AcquisitionView`, `CameraView`, `LoggingView`, `EventsView`,
`SettingsView`, plus the Login/Connections flow — decide explicitly: keep as-is behind the
breakpoint switch, redesign for the compact shell, or descope from primary mobile navigation
(still reachable, just not a top-level destination).

- **`DashboardView` — done.** Compact rendering groups modules by live status (needs attention /
  running / idle) rather than a flat list, subscribing every stateful interface up front instead
  of lazily per expanded row. Desktop rendering is untouched. Tapping a card only expands it
  inline (same as before) — it does **not** navigate to a module page, since that requires the
  ModulePage-style rework below, which hasn't happened yet. Expanding a card also still shows the
  same raw per-field state dump (`ModuleStateCard`/`KeyValueCard`) as desktop, not a curated
  one/two-line summary like the mockup's illustrative example — a known, deliberate simplification
  to keep this pass scoped, not an oversight.
- **Login/Connections flow — done, and restructured further than the original mockup.**
  `ConnectionsView.vue` is now a card list (tap to connect, "⋯" to edit) with a FAB for adding a
  connection; editing (secure-WebSocket toggle, VFS endpoints, password) moved to a new
  `EditConnectionView.vue`, since the old inline per-card accordion didn't survive contact with
  actually building it. Both Add and Edit take a password directly now — stored unverified (no
  live connect attempt, matching the VFS endpoint fields' own long-standing behavior), which
  wasn't in the original mockup but removes the login-form step entirely once a password is set.
- **`LoggingView`/`EventsView`** — the narrow-width table→flowing-list fix from earlier this
  session stands; not revisited against the Phase 0 visual language yet.
- **Module-grouped drill-down (`ModulePage`, mirroring `pyobs-gui`'s own redesign) — not started.**
  This is the piece that makes Dashboard cards navigate anywhere instead of just expanding
  inline, and what would let `CameraView`/`RoofView`/etc. stop being separate top-level routes.
  Real, separate work, not yet scoped into a phase here.
- **`ShellView`** — resolved: stays reachable on mobile (via More), not descoped. It's the only
  way to operate a module with no dedicated widget of its own, so cutting it isn't an option.
- Remaining unmigrated: `RoofView`, `ModeView`, `WeatherView`, `AutoFocusView`, `AutoGuidingView`,
  `AcquisitionView`, `CameraView`, `SettingsView` — all still reached via `MoreView.vue`'s plain
  list, same routes the old sidebar used, not yet redesigned or folded into ModulePage.

Migrate incrementally, each view landing as its own reviewable change. Suggested order (highest
real-world phone use first): ~~Dashboard~~ → ~~Connections/Login~~ → the ModulePage rework →
Roof/Mode/Weather → Logging/Events visual pass → Settings → AutoFocus/AutoGuiding/Acquisition.

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

- **Compact-nav destination set — resolved.** Dashboard, Logs, More (see Phase 1).
- **Exact visual language — resolved for the mockup, not yet reconciled with the real Bootstrap
  app.** The Phase 0 mockup reused this app's actual tokens (`#111316`/`#1a1d21`/`#2d3035`, status
  colors) rather than inventing a new palette, but the *implemented* views still use inline styles
  copied from the mockup rather than a shared set of Vue components/classes — a real design system
  vs. "restyled Bootstrap, consistently" is still an open call, not just a rubber-stamp of Phase 0.
- **Biometric re-auth — still open**, not resolved. Deferred to Phase 3 as planned; the app can
  now remember passwords, which makes this more relevant than when it was first raised, not less.
- **Whether `ShellView` stays in primary mobile navigation — resolved.** Stays, reachable via
  More: it's the only way to operate a module with no dedicated widget of its own.
- **New: the ModulePage-style module-grouped drill-down** (Phase 2) needs its own scoping pass —
  it's bigger than a per-view migration item, closer to a phase of its own.

## Incidental fixes found along the way

Not part of the redesign itself, but surfaced while building it:

- **Real app icon.** Capacitor's default icon was still in place; replaced with the actual pyobs
  wordmark (`resources/icon.png`, generated via `@capacitor/assets`) on the app's own dark
  background — including fixing the adaptive icon's background layer, which the generator left
  white and would have shown through the safe-zone inset as a border.
- **Debug-signing inconsistency.** Android Studio's Flatpak sandbox and a plain CLI shell see
  different `$HOME` on the dev machine, so each was signing debug builds with a different
  `$HOME/.android/debug.keystore` — every switch between the two looked like a different app to
  Android, forcing a full uninstall (and wiping app data, including saved passwords) on every
  switch. Fixed with a checked-in, project-relative debug keystore
  (`android/app/debug-shared.keystore`) both tools now sign with.

## References

- `specs/design/native-app-shell-capacitor.md` — why Vue/Capacitor, not a rewrite.
- `pyobs-core/specs/design/mobile-app-and-shared-ts-client-core.md` (superseded) — origin of the
  breakpoint-adaptive-layout idea this plan reuses.
- `DEVELOPMENT.md` — this repo's standing "mobile and desktop" constraint.
