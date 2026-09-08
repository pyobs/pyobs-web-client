# Design: pyobs-gui widget parity — registry, main/sidebar mechanism, and the gap list

Status: living reference, audited against `pyobs-gui` `main` (`mainwindow.py`, checked 2026-09-07).

Repos: pyobs-web-client (reference), pyobs-gui (source of truth, read-only here)

## Why this doc exists

Two mistakes are easy to make when building a widget in this client: (1) inventing curated fields
by guessing from a raw wire-protocol dataclass instead of checking what `pyobs-gui`'s own widget
actually shows (concrete instances caught 2026-09-07: `RoofView.vue` was missing the Azimuth row
`roofwidget.py` shows, `AutoFocusView.vue`/`AcquisitionView.vue` were curated to a generic
"Running: Yes/No" instead of `pyobs-gui`'s actual semantic labels — see
`specs/plans/2026-09-07-widget-visual-redesign.md`'s corrections section), and (2) not knowing
which interfaces exist at all because there's no single place listing them. This doc is that place:
`pyobs-gui`'s `MAIN_WIDGETS` registry, verbatim, plus which entries this client has and hasn't
built. **Adapt from the actual widget file, every time** — this doc tells you which file and
whether it's worth reading before writing a curated field list from scratch.

Living doc: `pyobs-gui`'s registry will keep growing (it already has, since the widget-parity
mechanism's own design doc was written — `IRobotic`/`IRoboticScheduler`/`IStructuredConfig` were
added after `pyobs-gui/specs/2026-08-28-gui-main-vs-sidebar-widgets.md`'s snapshot). Re-grep
`pyobs-gui/pyobs_gui/mainwindow.py` for `MainWidgetEntry(` before trusting this table stale by more
than a few weeks.

## The mechanism: main widgets vs. sidebar widgets

Full design history: `pyobs-gui/specs/2026-08-28-gui-main-vs-sidebar-widgets.md` (issue #150,
implemented `v2.3.0`). The parts that matter for adapting this to a mobile client:

- **One ordered registry** (`MainWidgetEntry`: interface, widget class, label, icon, optional
  `sidebar` tuple, `sidebar_preferred: bool`). A module matching several entries gets one page; ≥2
  matches → tabs, exactly 1 → no tab chrome. This is already this client's own model
  (`src/moduleWidgets.ts`'s `MODULE_WIDGETS` + `ModulePageView.vue`, see
  `specs/plans/2026-09-06-module-page-rework.md`) — good, no change needed to that part.
- **`sidebar_preferred` + the promotion rule is what this client is missing.** Some interfaces
  (`IFocuser`, `IFilters`, `ITemperatures`, `ICooling`) are marked `sidebar_preferred=True`.
  `collect_main_widgets` splits matches into `main = [not sidebar_preferred]` and, **only if `main`
  is empty**, promotes the `sidebar_preferred` matches into `main` instead. Concretely: a camera
  that's also a filter wheel gets one "Camera" tab with filter controls in the shared sidebar, not
  two tabs (that double-display was issue #150's original bug, fixed by this exact rule) — but a
  standalone filter-wheel-only module (no camera/telescope) still gets its own "Filter wheel" page,
  because `main` was empty so the promotion fires. **`src/moduleWidgets.ts`'s `widgetsForModule`
  today keeps every match unconditionally — it would reproduce issue #150's original bug the moment
  a Filters/Focuser/Temperatures/Cooling widget is built**, since nothing demotes them. Any of
  those four widgets landing (see `specs/plans/2026-08-04-auxiliary-interface-widgets.md`) needs
  this promotion rule ported first, not built against today's flat registry.
- **A shared sidebar is a property of the module's page, not of one tab** — `ALWAYS_SIDEBAR_WIDGETS`
  (today just `FitsHeadersWidget`) plus each surviving main entry's own `sidebar` tuple, unioned.
  This is exactly `ModulePageView.vue`'s already-existing (but empty) shared-section slot — see
  `specs/plans/2026-09-06-module-page-rework.md`'s "Shared section" note. Populating it should
  follow this same union rule: `ALWAYS`-equivalent content (none yet — see FITS headers below) +
  each active tab's own declared sidebar attachments, not per-tab duplicated content.
- **`paired_sidebar_widget`** (same interface, always-paired second widget) has exactly one
  consumer (`IVideo`'s split into `VideoWidget` main + ... actually current `mainwindow.py` shows
  `IVideo` as **two independent main-widget entries** now — "Live View" and "FITS Image", each its
  own tab, not a main+paired-sidebar pair. The `paired_sidebar_widget` mechanism described in the
  2026-08-28 doc was superseded by this simpler two-tabs approach before it shipped — don't build
  towards the paired-sidebar mechanism, there's no live example of it.

## Current `MAIN_WIDGETS` registry (verbatim, `mainwindow.py`, 2026-09-07)

| # | Interface | Widget | Label | `sidebar_preferred` | web-client status |
|---|---|---|---|---|---|
| 1 | `ICamera` | `CameraWidget` | Camera | — | **done** `CameraView.vue` |
| 2 | `ITelescope` | `TelescopeWidget` | Telescope | — | **done** `TelescopeView.vue` |
| 3 | `IRoof` | `RoofWidget` | Roof | — | **done** `RoofView.vue` (Azimuth row missing — see corrections below) |
| 4 | `IFocuser` | `FocusWidget` | Focuser | yes | built, not yet live-verified — `FocuserView.vue`, `specs/plans/2026-08-04-auxiliary-interface-widgets.md` |
| 5 | `IAutoFocus` | `AutoFocusWidget` | Auto focus | — | **done** `AutoFocusView.vue` (status label needs correction) |
| 6 | `IAcquisition` | `AcquisitionWidget` | Acquisition | — | **done** `AcquisitionView.vue` (status label needs correction) |
| 7 | `IAutoGuiding` | `AutoGuidingWidget` | Auto guiding | — | **done** `AutoGuidingView.vue` |
| 8 | `IWeather` | `WeatherWidget` | Weather | — | **done** `WeatherView.vue` |
| 9 | `IVideo` | `VideoWidget` | Live View | — | built, not yet live-verified — `VideoView.vue`, `specs/plans/2026-09-07-video-widget.md` |
| 10 | `IVideo` | `VideoGrabWidget` | FITS Image | — | built, not yet live-verified — `VideoGrabView.vue`, same plan as #9 |
| 11 | `ISpectrograph` | `SpectrographWidget` | Spectrograph | — | built, not yet live-verified — `SpectrographView.vue`, `specs/plans/2026-09-07-spectrograph-widget.md` |
| 12 | `IFilters` | `FilterWidget` | Filter wheel | yes | built, not yet live-verified — `FiltersView.vue`, `2026-08-04-auxiliary-interface-widgets.md` |
| 13 | `ITemperatures` | `TemperaturesWidget` | Temperatures | yes | built, not yet live-verified — `TemperaturesView.vue`, `2026-08-04-auxiliary-interface-widgets.md` |
| 14 | `ICooling` | `CoolingWidget` | Cooling | yes | **done** `CoolingView.vue`, live-verified — `2026-08-04-auxiliary-interface-widgets.md` |
| 15 | `IMode` | `ModeWidget` | Mode | — | **done** `ModeView.vue`/`ModeModuleCard.vue` |
| 16 | `IRobotic` | `RoboticWidget` | Robotic | — | built, not yet live-verified — `RoboticView.vue`, `specs/plans/2026-09-07-robotic-widgets.md` |
| 17 | `IRoboticScheduler` | `ScheduleWidget` | Scheduler | — | built, not yet live-verified — `ScheduleView.vue`, same plan as #16 |
| 18 | `IStructuredConfig` | `StructuredConfigWidget` | Config | — | built (Phase 1: flat fields only), not yet live-verified — `ConfigView.vue`, `specs/plans/2026-09-07-structured-config-widget.md` |

`ALWAYS_SIDEBAR_WIDGETS = (FitsHeadersWidget,)` — see "FITS headers" below, not planned yet (open
question, not a committed gap).

## Widgets that are *not* in `MAIN_WIDGETS` (helper/embedded, not per-module pages)

Read for reference when they inform a main widget's own behavior, not as separate pages:

- **`compassmovewidget.py`** (`CompassMoveWidget`) — four N/S/E/W offset buttons embedded inside
  `TelescopeWidget`, converting a fixed arcsec step into `set_offsets_radec`/`set_offsets_altaz`
  (auto-picks frame from whichever the module implements, converting via `IPointingAltAz`'s current
  position when only the other frame's offset interface exists). `TelescopeView.vue` today only has
  the plain numeric offset fields it already had — no directional buttons. Worth adding as a small
  follow-up to the already-done Telescope page (not a new widget/plan; see "Telescope: compass
  offset buttons" below) once the current visual-redesign pass lands.
- **`fitsheaderswidget.py`** (`FitsHeadersWidget`, `ALWAYS_SIDEBAR_WIDGETS`) — OBJECT/USER fields
  plus freeform additional key/value headers, merged into every FITS file this module grabs.
  **Open question, not a committed gap**: does `pyobs-core`'s `grab_data`/`set_image_type` RPC path
  even accept caller-supplied extra headers, or is header injection a different, non-RPC mechanism
  in `pyobs-core`? Check `pyobs-core`'s FITS-writing path before scoping a widget — no point
  designing a form for headers the wire protocol has no slot for.
- **`datadisplaywidget.py`** — shared grab/fetch/display logic `CameraWidget`/`VideoGrabWidget`/
  `SpectrographWidget` all delegate to. This client's equivalent is `CameraView.vue`'s own
  `expose()` + `FitsCanvas.vue` — already built, reusable as-is for the Spectrograph plan below
  (same `grab_data` → VFS-resolve → fetch → `FitsCanvas` shape, no windowing/binning/gain).
- **`statuswidget.py`** (`StatusWidget`) — the generic per-module expandable detail tree (every
  interface's raw state, colored by kind), i.e. `pyobs-gui`'s own version of a "show me everything"
  view. **This is not a gap** — `DashboardView.vue`'s expand-per-module `KeyValueCard` raw dump
  already matches this widget's own intentionally-generic, uncurated design. Don't curate
  Dashboard's expand view; that would be *diverging* from `pyobs-gui`, not catching up to it.
- **`shellwidget.py`/`commandinputwidget.py`** → `ShellView.vue` (already built, matches shape).
- **`eventswidget.py`** → `EventsView.vue` (already built).
- **`structuredconfigwidget.py`'s field-editor internals** inform the new Config-widget plan but
  the file itself isn't a `MAIN_WIDGETS` entry — `IStructuredConfig`'s `StructuredConfigWidget` at
  row 18 is.

## Corrections needed in already-"done" web-client widgets

Found 2026-09-07 while cross-checking curated fields against the actual `pyobs-gui` source (the
methodological mistake this doc exists to prevent — see `specs/plans/2026-09-07-widget-visual-redesign.md`'s
own corrections section for the concrete diffs to apply):

- **`RoofView.vue`** — `roofwidget.py` shows Status *and* Azimuth (when the module also implements
  `IPointingAltAz`, "N/A" otherwise). Current curated `StatusRow` only has Status.
- **`AutoFocusView.vue`** — `autofocuswidget.py`'s `labelStatus` is "Running..." / `"Focus: X ± Y
  mm"` (last result) / "Idle" — not a generic "Running: Yes/No".
- **`AcquisitionView.vue`** — `acquisitionwidget.py`'s `labelStatus` is "Acquiring..." / "Acquired."
  / "Idle" — same mistake, generic boolean instead of the semantic three-state label.
- **`AutoGuidingView.vue`** — already correct (`loopStateLabel`: "Closed loop"/"Open loop"/
  "Stopped", matches `autoguidingwidget.py`'s `labelLoopState` exactly) — a redundant generic
  "Running: Yes/No" row was added alongside it during the same pass; remove it, not add to it.

## Telescope: compass offset buttons (small follow-up, not a new plan)

`compassmovewidget.py`'s four-button N/S/E/W nudge (fixed arcsec step, auto frame conversion) has
no equivalent in `TelescopeView.vue` — operators can only type a numeric `dalt`/`daz` or `dra`/
`ddec` offset today. Real usability gap for one-handed mobile use (small course corrections during
an observation) but scoped tightly enough (one small component, reusing `TelescopeView.vue`'s
already-subscribed position state) that it doesn't need its own plan doc — fold into a future
Telescope-page follow-up once the current visual-redesign pass (`2026-09-07-widget-visual-redesign.md`)
lands, so it isn't competing with that plan's higher-priority "fix what's already shipped" goal.

## References

- `pyobs-gui/specs/2026-08-28-gui-main-vs-sidebar-widgets.md` — full design history for the main/
  sidebar mechanism (D1-D6); the registry snapshot inside it is stale, use `mainwindow.py` directly.
- `specs/plans/2026-08-04-auxiliary-interface-widgets.md` — needs revision to explicitly adopt the
  `sidebar_preferred`/promotion-rule terminology from this doc rather than its own independently-derived
  "attach dynamically" language, which arrived at a similar but not identical mechanism.
- `specs/plans/2026-09-07-video-widget.md`, `2026-09-07-spectrograph-widget.md`,
  `2026-09-07-structured-config-widget.md`, `2026-09-07-robotic-widgets.md` — new plans for the
  four completely-unbuilt registry rows.
- `specs/plans/2026-09-07-widget-visual-redesign.md` — the in-progress visual pass; its corrections
  section is where the Roof/AutoFocus/Acquisition/AutoGuiding fixes above actually get applied.

