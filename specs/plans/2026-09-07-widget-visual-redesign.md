# Plan: Module widget visual redesign (curated status, shared design system)

Status: in progress — steps 1-9 landed in a first pass (shared `.pyobs-card` class, `StatusRow.vue`,
sexagesimal formatting, button convention, all 8 non-Weather widgets converted). See "Corrections"
below for defects found immediately afterward, while cross-checking against `pyobs-gui`'s actual
widgets and live-testing against real modules — not yet applied.

Repos: pyobs-web-client

## Context

The Phase 0 mockup for `specs/plans/2026-09-06-mobile-first-redesign.md` set a visual language —
rounded pill buttons (solid blue for the primary action, outlined for secondary), curated per-field
status rows (`module-page.png`'s "Status / RA-Dec / Alt-Az"), a dark-card treatment for grouped
info — checked into `specs/plans/mobile-first-redesign/*.png`. That plan's own "Open questions"
flagged this was never finished: "Exact visual language — resolved for the mockup, not yet
reconciled with the real Bootstrap app... the *implemented* views still use inline styles copied
from the mockup rather than a shared set of Vue components/classes." `specs/plans/index.md`'s entry
for that plan already tracks this as outstanding ("per-widget compact visual passes still
outstanding").

Confirmed directly against the code (2026-09-07) that the gap is worse than "not yet a design
system" — the 7 module widgets don't apply the mockup's visual language at all, including
`TelescopeView.vue`, whose own plan (`2026-08-03-telescope-page.md`) is marked **done** and was
live-verified on real hardware. "Done" there meant functional scope only; visually it's unrelated to
its own mockup.

## Current shape (confirmed against the code)

- **`KeyValueCard.vue`** (rendered via `ModuleStateCard.vue`) auto-dumps every field of a raw
  interface state object as generic uppercase-labelled key/value rows. Used as the primary "Status"
  display in `RoofView.vue`, `TelescopeView.vue` (twice — `IMotion` and each pointing interface),
  `AutoFocusView.vue`, `AutoGuidingView.vue`, `AcquisitionView.vue`, `CameraView.vue`, and
  `ModeModuleCard.vue`. This is a debug-style renderer, not a designed widget — it shows raw fields
  like `devices` and `time` that the mockup never surfaces, and none of the mockup's specific rows
  ("Status / RA-Dec / Alt-Az").
- **Buttons** are plain Bootstrap (`btn btn-outline-secondary btn-sm`, `btn-outline-danger btn-sm`)
  everywhere, with exactly one exception: `TelescopeView.vue`'s Move buttons use `btn-primary` —
  the only place in the app matching the mockup's solid-blue primary-action convention. Everywhere
  else (Init/Park/Stop, Run/Acquire, Expose, Start/Stop guiding, Set Mode/Rate) uses the same flat
  outline style regardless of whether the action is the widget's primary call-to-action or a
  secondary one.
- **Card styling** is copy-pasted inline hex across files rather than one shared class:
  `background-color:#15181c; border:1px solid #2d3035` (or `#1a1d21`/`#2d3035`) appears verbatim in
  `KeyValueCard.vue`, `ModeModuleCard.vue`, `WeatherView.vue` (×3), `AutoGuidingView.vue` (×2),
  `AcquisitionView.vue` (×2), `CameraView.vue`, and `DashboardView.vue`. A shared class doesn't
  exist for this today.
- **Found along the way — dead class reference.** `TelescopeView.vue:287` applies a `pyobs-panel`
  class that is never defined anywhere in `src/assets/main.css` or any component's `<style>` block
  (confirmed by grep). It silently does nothing; someone reached for a shared design-system class
  that was never actually built. This plan is that missing piece.
- **`WeatherView.vue`** is the one widget already close to curated (per-sensor cards with
  labelled value/unit and a chart) rather than a raw dump — it needs the shared card/button
  treatment applied, not a field-curation rewrite.
- **`ModeModuleCard.vue`** is partially curated (a dedicated `<select>` per mode group) but still
  shows a redundant `KeyValueCard` "Status" dump of the same `modes` dict right above the selects.

## Goal

Every module widget's status display and buttons match the mockup's visual language: curated,
named fields per interface (not raw dict dumps), a consistent button hierarchy (solid primary /
outlined secondary / outlined danger), and one shared card treatment — implemented as reusable
Vue components/CSS so the next widget gets this for free, not another copy-paste pass.

## Non-goals

- **Dashboard, Logs, More, Connections, Login, Shell.** Same underlying inline-style-repetition
  problem exists there too (confirmed in `DashboardView.vue` above), but the user's complaint and
  this plan are scoped to the 7 module widgets specifically. A shared card class this plan
  introduces should be reusable there later, but retrofitting those views is separate work.
- **The `ModulePageView.vue` shared-across-tabs section** (temperatures, per the mockup's bottom
  block). Per `2026-09-06-module-page-rework.md`, no `ITemperatures` widget exists yet to populate
  it — building curated UI for an interface nothing implements yet is exactly the speculative work
  that plan warned against. Out of scope here too.
- **New functionality** (`IDataSequence`, push notifications, etc.) — explicitly deprioritized
  below this work per this session's discussion: get the shipped widgets right before adding more.

## Decisions to make

### Shared building blocks

Two new pieces, both under `src/components/`:

- **A shared card class** (e.g. `.pyobs-card` in `main.css`, replacing the never-defined
  `pyobs-panel` reference and the repeated inline hex) — one definition for the dark
  card/panel treatment every widget already approximates by hand.
- **`StatusRow.vue`** — a generic curated-field display: takes `fields: { label: string; value:
  string }[]` and renders them as labelled rows (mockup's "Status / Tracking", "RA / Dec / ...").
  One generic component driven by data, not seven near-identical per-interface components — each
  widget's own `<script>` computes its curated `fields` from the raw subscribed state (widgets
  already subscribe to state directly in several places, e.g. `WeatherView.vue`,
  `AutoFocusView.vue`; the remaining ones move from `ModuleStateCard`'s raw-dump prop to this).
  `KeyValueCard`/`ModuleStateCard` stay as-is for any actually-generic fallback use (none identified
  today, but not being deleted speculatively either).

### Button convention (resolved)

- **One primary action per widget** (the thing the widget exists to do — Move, Expose, Run/Acquire,
  Start guiding) → `btn-primary`, matching the mockup's solid-blue "Move to coordinates".
- **Secondary/idempotent controls** (Init, Offset, Set Mode, Set Rate, Settings toggle) →
  `btn-outline-secondary`, matching the mockup's outlined "Init/Park" pair.
- **Destructive/abort** (Park, Stop, Abort) → `btn-outline-danger`. Already partially this
  convention (`stop_motion`, `abort` already use `btn-outline-danger`) — extend it consistently,
  and reclassify `park` as destructive-styled too (mockup's "Park" sits in the same outlined-pill
  row as Init/Stop, not styled as primary; keeping it `btn-outline-secondary` matches the mockup,
  no change needed there — only `Stop` needs the danger treatment it already mostly has).

### Per-interface curated fields

Resolved per interface, replacing today's `KeyValueCard` raw dump wherever it's the primary status:

- **`IMotion`** (Roof, Telescope): one row, `status` (`MotionStatus` enum value — "Tracking",
  "Parked", "Idle", etc., mirrors `pyobs-gui`'s `roofwidget.py`'s `labelStatus`). Drop `devices`
  and `time` — not shown in the mockup, not needed for an at-a-glance status.
- **`IPointingRaDec` / `IPointingAltAz`** (Telescope): `ra`/`dec` formatted sexagesimal, `alt`/`az`
  in degrees — exactly the mockup's "RA / Dec: 05h 35m 17s / -05° 23'", "Alt / Az: 61.2° / 138.4°".
  `astroCoords.ts` already has the coordinate math for the destination preview; check whether it
  (or a small addition to it) already produces sexagesimal formatting, or whether that needs adding.
- **`IMode`**: drop the redundant `KeyValueCard` dump entirely — the per-group `<select>`s already
  show current mode; a raw dump of the same `modes` dict one row above them is pure duplication, not
  a curation problem to solve.
- **`IRunning`** (AutoFocus, AutoGuiding, Acquisition) — **corrected, see "Corrections" below**: a
  generic "Running: Yes/No" was tried first and is wrong. Each of the three has its own semantic
  label in the actual `pyobs-gui` widget, verified against the source (not a shared component after
  all — the three sets of semantics are all different):
  - **AutoFocus** (`autofocuswidget.py`'s `labelStatus`): "Running..." if running, else `f"Focus:
    {focus:.3f} ± {err:.3f} mm"` if a result exists, else "Idle".
  - **AutoGuiding** (`autoguidingwidget.py`'s `labelLoopState`) — **already correctly implemented**
    in this app pre-existing as `loopStateLabel`: "Closed loop" / "Open loop" / "Stopped". Don't
    add a second, generic row alongside it.
  - **Acquisition** (`acquisitionwidget.py`'s `labelStatus`): "Acquiring..." if running, else
    "Acquired." if a result exists, else "Idle".
- **`IExposure`** (Camera): `status`, `progress` (as a progress bar, not a raw percentage row —
  matches the mockup's general preference for visual state over bare numbers), `exposure_time_left`
  when `status` indicates one is running.
- **`IWeather`**: already curated (per-sensor cards) — no field-curation change, only the shared
  card class swap.

## Implementation plan

Ordered so the shared pieces land before anything depends on them, then one widget at a time so a
mistake in one doesn't block the rest (mirrors `module-page-rework.md`'s own build-order note):

1. **`main.css`**: add the shared card class; remove/replace the dead `pyobs-panel` reference.
2. **`StatusRow.vue`** (new, `src/components/`): generic `fields` prop, styled per the mockup
   (label + value row, not the uppercase-title dict-dump look).
3. **`astroCoords.ts`**: add sexagesimal RA/Dec formatting if not already present, needed by step 5.
4. **`RoofView.vue`**: swap `ModuleStateCard` → curated `IMotion` `StatusRow`; apply shared card
   class; confirm button convention already matches (it does — no primary action here, all three
   buttons are secondary/danger per the mockup's Roof-equivalent framing).
5. **`TelescopeView.vue`**: swap both `ModuleStateCard` uses (`IMotion`, and each of
   `IPointingRaDec`/`IPointingAltAz`) → curated `StatusRow`s; fix the dead `pyobs-panel` reference to
   the new shared class.
6. **`ModeModuleCard.vue`**: drop the redundant `KeyValueCard` status dump; apply shared card class.
7. **`WeatherView.vue`**: apply shared card class only (already curated).
8. **`AutoFocusView.vue`, `AutoGuidingView.vue`, `AcquisitionView.vue`**: swap their `IRunning`
   `ModuleStateCard` → curated `StatusRow`; apply button convention (Run/Acquire/Start → primary,
   Abort/Stop → danger, already-danger ones unchanged); apply shared card class to their chart
   containers.
9. **`CameraView.vue`**: swap `IExposure` `ModuleStateCard` → curated `StatusRow` with a progress
   bar; Expose button → `btn-primary` (currently outline-secondary, the clearest single-widget
   mismatch with the mockup's primary-action convention); apply shared card class.

## Corrections (found 2026-09-07, immediately after the first implementation pass)

**Root cause, stated once so it doesn't repeat**: curated fields were derived by guessing from the
raw wire-protocol dataclass shape instead of reading the actual `pyobs-gui` widget that already
solved this exact problem. `specs/design/pyobs-gui-widget-parity.md` exists specifically to stop
this — check it, and the widget file it points to, before curating any interface's fields. The
`IRunning` fix two sections up is the clearest instance: three different real semantics, collapsed
into one wrong generic guess.

- **`RoofView.vue` is missing an Azimuth row.** `roofwidget.py` shows Status *and* Azimuth (from
  `IPointingAltAz` when the roof module also implements it, "N/A" otherwise) — not Status alone.
- **`AutoFocusView.vue` / `AcquisitionView.vue` need the semantic status labels** from the corrected
  `IRunning` bullet above, replacing the generic "Running: Yes/No" `StatusRow` currently there.
- **`AutoGuidingView.vue` has a redundant row** — confirmed live (real `guiding@localhost` dummy
  module, admin session, 2026-09-07): the page showed "Running: No" *and*, a few pixels below it,
  "Stopped" (the pre-existing, already-correct `loopStateLabel`). Delete the added `StatusRow`
  entirely; nothing needs to change about `loopStateLabel`.
- **`AutoGuidingView.vue`'s control row is cluttered.** Live-tested at desktop width and it's
  already bad there, not just on narrow screens: Start, Stop, the exposure-time input, its Set
  button, and the loop-state label all sit in one unstructured `flex-wrap` row with no visual
  grouping — reads as a jumble, not a designed control cluster. Needs actual grouping (e.g.
  start/stop as one cluster, exposure-time input+Set as a labelled sub-group, loop-state as a
  status pill rather than a bare span) as part of this pass, not deferred.
- **Every hand-rolled chart component renders illegibly on narrow screens.** `OffsetMagnitudeChart.vue`,
  `DistanceChart.vue`, `FocusCurveChart.vue`, `TimeSeriesChart.vue` (`WIDTH = 600, HEIGHT = 160`) and
  `OffsetScatterChart.vue` (`SIZE = 300`) all draw at one fixed internal canvas resolution sized for
  desktop, then rely on `max-width:100%; height:auto` to shrink the whole canvas for narrow
  viewports — every axis label and tick, drawn at fixed internal pixel coordinates assuming the full
  600px (or 300px) width, shrinks proportionally along with it, becoming tiny and unreadable well
  before phone width. This violates `specs/steering/mobile-and-desktop.md`'s standing constraint and
  was never checked against a narrow viewport before now. Fix: size each canvas's internal
  resolution from its actual rendered container width (a `ResizeObserver` on the wrapping element,
  redrawing at the observed size) instead of a fixed constant, so text is drawn at a size that's
  always legible relative to the visible canvas — not scaled-down desktop text. Affects 5
  components; fix the sizing mechanism once (a small shared composable, e.g. `useResponsiveCanvas`)
  rather than five separate one-off fixes.
- **`CameraView.vue`'s progress bar and time-left display were re-verified against the plan's own
  intent and are correct as implemented** (`exposure_time_left.toFixed(1)` — one decimal, not raw
  precision; a real Bootstrap `.progress`/`.progress-bar`, not a bare percentage number) — flagged
  as a possible issue during this audit, listed here so it isn't re-litigated: no change needed,
  confirmed by reading the code directly (`CameraView.vue`'s exposure status block).

## Open questions

- **Sexagesimal RA/Dec formatting** — confirm during step 3 whether `astroCoords.ts` already has
  this (it computes coordinate transforms, may or may not format for display) before assuming new
  code is needed.
- **Progress bar component** — Bootstrap ships one (`progress`/`progress-bar` classes); confirm
  that's sufficient for `IExposure`'s curated row before reaching for a custom component.

## References

- `specs/design/pyobs-gui-widget-parity.md` — the full `pyobs-gui` `MAIN_WIDGETS` registry and the
  corrections above; check it before curating any interface's fields, here or in a future widget.
- `specs/plans/2026-09-06-mobile-first-redesign.md` — the mockup and its unresolved visual-language
  open question this plan closes out.
- `specs/plans/2026-09-06-module-page-rework.md` — the tab-per-module structure these widgets
  render inside; its "Shared section" note is why the temperatures panel stays out of scope here.
- `specs/plans/mobile-first-redesign/module-page.png` — the concrete visual target for Telescope's
  curated status rows and button styling.
- `src/components/KeyValueCard.vue`, `src/components/ModuleStateCard.vue` — the generic dump being
  replaced for these 7 widgets' primary status display.
