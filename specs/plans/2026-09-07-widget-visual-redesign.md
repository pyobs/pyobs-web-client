# Plan: Module widget visual redesign (curated status, shared design system)

Status: done — steps 1-9 landed 2026-09-07 (shared `.pyobs-card` class, `StatusRow.vue`,
sexagesimal formatting, button convention, all 8 non-Weather widgets converted), and every
correction found afterward (cross-checking against `pyobs-gui`'s actual widgets, live-testing
against real modules, and further live feedback) landed and was live-verified 2026-09-08: Roof
azimuth, AutoFocus/Acquisition status semantics, AutoGuiding's redundant row and control-row
grouping, the mobile chart-legibility fix (`useResponsiveCanvas`), mismatched chart-card widths,
charts popping in instead of always being visible, and full-width action-button/input rows across
every widget. See "Corrections" for the complete list with before/after evidence.

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

- **`RoofView.vue` is missing an Azimuth row — fixed 2026-09-08.** `roofwidget.py` shows Status
  *and* Azimuth (from `IPointingAltAz` when the roof module also implements it, "N/A" otherwise).
  Live-verified against `roof@localhost` (`DummyRoof`, no `IPointingAltAz`): renders "Status: Idle" /
  "Azimuth: N/A" correctly.
- **`AutoFocusView.vue` / `AcquisitionView.vue` needed the semantic status labels — fixed
  2026-09-08.** Live-verified: AutoFocus shows "Idle" before a run and "Focus: 10.000 ± 0.098 mm"
  after (`autofocuswidget.py`'s exact semantics); Acquisition shows "Idle" (module has no prior
  result in this test session — "Acquiring..."/"Acquired." paths verified by code review, matching
  `acquisitionwidget.py`).
- **`AutoGuidingView.vue`'s redundant row — fixed 2026-09-08.** Live-verified against
  `guiding@localhost`: only "Stopped" (the pre-existing, correct `loopStateLabel`) shows now: the
  redundant "Running: No" row is gone.
- **`AutoGuidingView.vue`'s control row is cluttered — fixed 2026-09-08.** Live-tested at desktop
  width and it was already bad there, not just on narrow screens: Start, Stop, the exposure-time
  input, its Set button, and the loop-state label all sat in one unstructured `flex-wrap` row with
  no visual grouping. Regrouped: loop state promoted to a proper `StatusRow` ("Loop: Stopped"/"Open
  loop"/"Closed loop", consistent with every other widget's status display), Start/Stop as their own
  button row, exposure-time input+Set as its own labelled row below. Live-verified.
- **Every hand-rolled chart component renders illegibly on narrow screens — fixed 2026-09-08,
  confirmed and measured live** (real mobile emulation, 400×869 CSS viewport, Nexus 5 UA, compact
  shell active — not just predicted from the fixed `WIDTH`/`HEIGHT` constants, but directly
  measured *before and after*): `AcquisitionView.vue`'s `DistanceChart` (`WIDTH=600, HEIGHT=160`,
  ×2 DPR → 1200×320 internal canvas pixels) rendered into a **386.7px-wide** CSS box before the
  fix — a **2.76×** downscale below its 600px design width, with "Distance [arcsec]"/"attempt N"
  axis labels reduced to a few illegible pixels in the actual screenshot. `OffsetScatterChart`
  (`SIZE=300`) fared much better at 314px CSS width — nearly 1:1, legible — because a square chart's
  design width is much closer to a phone column's actual width than a 600px-wide one is; the bug was
  specific to the four *wide* charts (`OffsetMagnitudeChart`, `DistanceChart`, `FocusCurveChart`,
  `TimeSeriesChart`, all `600×160`), not `OffsetScatterChart`. Fix, applied via a new
  `src/composables/useResponsiveCanvas.ts`: each canvas's internal resolution now derives from its
  actual rendered container width (a `ResizeObserver` on the canvas element, redrawing at the
  observed width, fixed `HEIGHT` unchanged) instead of a fixed `WIDTH` constant. Re-measured after
  the fix: the same `DistanceChart` now renders at exactly 1:1 (342.4px CSS width → 684px internal
  at 2x DPR, matching precisely, no downscale), and the axis labels are clearly legible in the
  post-fix screenshot.
- **Chart cards had mismatched widths — found and fixed 2026-09-08 (live feedback: "make both plots
  same width, currently it looks weird").** `AcquisitionView.vue`/`AutoGuidingView.vue`'s scatter
  chart card had a leftover `style="max-width:340px"` while its sibling line chart card was
  unconstrained — the two cards didn't align edges. Removed the cap; `OffsetScatterChart`'s own
  `aspect-ratio:1` CSS just makes it a full-width square now, no distortion. Re-measured: both cards
  342.4px wide, exactly matching.
- **Charts popped in only once data existed instead of always being visible — found and fixed
  2026-09-08 (live feedback: "always show the plots, popping up elements is not so nice").**
  `AutoGuidingView.vue`, `AcquisitionView.vue`, `AutoFocusView.vue`, and `WeatherView.vue`'s
  per-sensor `TimeSeriesChart` were all gated behind `v-if="points.length > 0"` (or similar).
  Removed the gates — every chart component already handles an empty/short points array gracefully
  (`OffsetScatterChart` even draws a proper empty-state placeholder: origin crosshair, border, ±1.2
  default-range tick labels), so the card is now always present and fills in as data arrives, no
  layout shift. Live-verified on a freshly-restarted, genuinely-empty `acquisition` module: renders
  a blank `DistanceChart` and a clean placeholder `OffsetScatterChart`, no crash, no visual break.
- **Every action-button row and multi-field input row sat narrow and left-aligned instead of
  spanning full width — found and fixed 2026-09-08 (live feedback: "wouldn't it be nice if the three
  input fields fill the full width together? also the two buttons below?", confirmed against the
  mockup: yes — `module-page.png`'s own Init/Park/Stop and RA/Dec rows span the full width in
  roughly-equal segments, not narrow fields with dead space).** Applied `flex-fill` (multi-button/
  input rows: Roof's Open/Close/Stop, Telescope's Init/Park/Stop and RA/Dec-Alt/Az-Tracking toggle,
  AutoFocus's Count/Step/Exposure and Run/Abort, AutoGuiding's Start/Stop, Acquisition's
  Acquire/Abort) or `w-100` (solo action buttons: Camera's Expose, Telescope's per-section Move/
  Offset/Set Mode/Set Rate/Track) consistently across every widget. AutoFocus's "Exposure time
  (seconds)" label wrapped to two lines once squeezed into a third-width column — shortened to
  "Exposure (s)" (dropped the wire-schema-derived unit string in favor of a fixed short form,
  matching `AutoGuidingView.vue`'s own existing "(s)" convention) to keep it one line. Live-verified
  across all 6 affected widgets.
- **`CameraView.vue`'s progress bar and time-left display were re-verified against the plan's own
  intent and are correct as implemented** (`exposure_time_left.toFixed(1)` — one decimal, not raw
  precision; a real Bootstrap `.progress`/`.progress-bar`, not a bare percentage number) — flagged
  as a possible issue during this audit, listed here so it isn't re-litigated: no change needed,
  confirmed by reading the code directly (`CameraView.vue`'s exposure status block).

## Open questions

None outstanding — both resolved during implementation: `astroCoords.ts` had no sexagesimal
formatting, added (`formatRaSexagesimal`/`formatDecSexagesimal`, with unit tests); Bootstrap's own
`progress`/`progress-bar` classes were sufficient for `IExposure`'s curated row, no custom component
needed.

## References

- `specs/design/pyobs-gui-widget-parity.md` — the full `pyobs-gui` `MAIN_WIDGETS` registry and the
  corrections above; check it before curating any interface's fields, here or in a future widget.
- `src/composables/useResponsiveCanvas.ts` — the chart-legibility fix; any new hand-rolled `<canvas>`
  chart should use this from the start rather than a fixed `WIDTH` constant.
- `specs/plans/2026-09-06-mobile-first-redesign.md` — the mockup and its unresolved visual-language
  open question this plan closes out.
- `specs/plans/2026-09-06-module-page-rework.md` — the tab-per-module structure these widgets
  render inside; its "Shared section" note is why the temperatures panel stays out of scope here.
- `specs/plans/mobile-first-redesign/module-page.png` — the concrete visual target for Telescope's
  curated status rows and button styling.
- `src/components/KeyValueCard.vue`, `src/components/ModuleStateCard.vue` — the generic dump being
  replaced for these 7 widgets' primary status display.
