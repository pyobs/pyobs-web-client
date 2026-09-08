# Plan: auxiliary interface widgets (attach-or-standalone)

Status: in progress. **Revised 2026-09-07**: this plan's "attach dynamically" design was derived
independently before `specs/design/pyobs-gui-widget-parity.md` existed, and arrived at a mechanism
close to but not identical with `pyobs-gui`'s actual one (`sidebar_preferred` + the promotion rule,
`pyobs-gui/specs/2026-08-28-gui-main-vs-sidebar-widgets.md` D1). Read that doc first — the
terminology and exact demotion/promotion condition below are now aligned to it; the four widget
components and their `pyobs-gui` references are unchanged. **2026-09-08: `ICooling`/`CoolingView.vue`
done and live-verified** (`camera@localhost`'s `DummyCamera`, which implements both `ICamera` and
`ICooling` — confirms the demotion case: no separate "Cooling" tab appears, the widget renders in
`ModulePageView.vue`'s shared section instead, in its own labelled box; `set_cooling` RPC verified
working end-to-end, state updated live). `FiltersWidget.vue`/`TemperaturesWidget.vue`/
`FocuserWidget.vue` and the promoted-to-main (standalone-module) case remain to be built/verified.

Repos: pyobs-web-client (all implementation here)

## Problem statement

Some interfaces are "auxiliary": `pyobs-gui` gives each its own small widget
(`coolingwidget.py`, `filterwidget.py`, `temperatureswidget.py`,
`focuswidget.py`), but none of them is ever a page's whole reason to exist —
a real deployment shows a cooling widget because the module is *also* a
camera or telescope, not because "cooling" is a standalone concern anyone
navigates to on its own. But nothing stops a module from implementing, say,
`ICooling` with no camera/telescope alongside it (a standalone chiller
controller) — that module still needs to be reachable somehow.

This client's current sidebar/routing model doesn't have a slot for that.
`AppLayout.vue`'s `NAV_INTERFACES` config-driven loop gives exactly one
dedicated page+route+nav-entry per interface in a fixed, manually-maintained
list (`IRoof`, `ICamera`, `IMode`, `IWeather`, `IAutoFocus`, `IAutoGuiding`,
`IAcquisition`) — every interface in it is implicitly "primary." Auxiliary
interfaces don't fit that without becoming either:

- **Always-primary**: a permanent "Cooling" nav entry even when it's really
  part of the Camera story — wrong, duplicates concerns, and `pyobs-gui`
  itself never does this (cooling only ever appears inside `CameraWidget`'s
  sidebar).
- **Manually wired per host page, one at a time**: what
  `specs/plans/2026-08-03-camera-page.md`'s phase 3 did for `ICamera` specifically
  (`IWindow`/`IBinning`/`IGain`/etc., hardcoded directly into
  `CameraView.vue`) — doesn't generalize to Telescope, or to a standalone
  module with no host page at all.

## Decided (confirmed with the user before writing this plan)

- **Attachment is fully dynamic, no per-interface host list.** Any primary
  page auto-renders every auxiliary widget the *same* module also
  implements — no config declaring "`ICooling` attaches to `ICamera`,
  `ITelescope`." Simpler, self-updating for new module combos; the
  tradeoff (a genuinely odd interface combo would just render, with no one
  having decided it should) was accepted as acceptable.
- **Standalone fallback is auto-generated, not hand-built.** A module
  implementing an auxiliary interface with no primary interface alongside
  it gets a page + nav entry through the same generic machinery, not a
  bespoke page per interface (unlike e.g. `WeatherView.vue`, which is
  hand-built because `IWeather` is primary).

## Scope

### 1. Widget components

Each auxiliary interface gets one Vue component, decoupled from routing —
same prop shape `ModuleStateCard.vue` already uses (`jid` +
interface-name/version), extended with whatever action controls it needs,
reusing `ParamForm.vue`/`ModuleStateCard.vue` exactly as `CameraView.vue`'s
phase 3 settings panel already does (see that plan for the established
pattern: stage values, one RPC call per action, capability/enum-aware
defaults). Four to start, each with a direct `pyobs-gui` reference:

- **`CoolingWidget.vue`** (`ICooling`) — `pyobs_gui/coolingwidget.py`.
  Enabled toggle + target temperature (`set_cooling(enabled, temp)`);
  status shows current setpoint + cooler power (`%`) when enabled, "OFF"
  when not.
- **`FiltersWidget.vue`** (`IFilters`) — `pyobs_gui/filterwidget.py`.
  `IFilters` also extends `IMotion` — gate `set_filter` on motion status
  (only enabled when idle/positioned/tracking/slewing-complete, not
  mid-move), matching `filterwidget.py`'s own `initialized` check exactly,
  not just disabled-while-a-request-is-in-flight like this app's other
  action buttons.
- **`TemperaturesWidget.vue`** (`ITemperatures`) —
  `pyobs_gui/temperatureswidget.py`. Read-only, multiple named sensor
  readings + history — reuse `WeatherView.vue`'s already-built per-sensor
  tile + bounded-history-array pattern and its `TimeSeriesChart.vue`
  (per `2026-08-03-camera-page.md`'s dropped phase 4 note — this plan supersedes
  that note; `ITemperatures` is scoped here now, not as a Camera-specific
  follow-up).
- **`FocuserWidget.vue`** (`IFocuser` — confirmed against `pyobs-core`;
  there is no `IFocus`) — `pyobs_gui/focuswidget.py`. Also extends
  `IMotion`, same motion-status gating as Filters. Two independent values
  (`FocuserState.focus`, `.focus_offset`) + a "reset offset to 0" action
  alongside `set_focus`/`set_focus_offset`.

### 2. Registry + auto-attach — **revised 2026-09-07**

Originally proposed as a standalone `AUXILIARY_INTERFACES` config + `AuxiliaryWidgets.vue` dropped
into each primary page's own template. Superseded by tying this directly to `ModulePageView.vue`'s
already-existing (currently empty) shared-section slot instead — see
`specs/plans/2026-09-06-module-page-rework.md`'s "Shared section" note, which was written
anticipating exactly this: "the mobile-shell adaptation of pyobs-gui's shared sidebar column... no
consumer exists yet." That slot, not a per-page manual drop-in, is where a demoted (`sidebarPreferred`,
per the section 3 revision above) widget belongs — it renders once per module page regardless of
which tab is active, matching `pyobs-gui`'s own "sidebar is a property of the page, not one tab"
rule exactly. Concretely: `ModulePageView.vue`'s shared-section slot renders every currently-matched
module widget entry whose `sidebarPreferred` is true and wasn't promoted to `main` this render —
the same list `widgetsForModule`'s corrected promotion logic (section 3) already computes, just the
demoted half of its output rather than a separate lookup.

### 3. Standalone fallback page + nav — **superseded 2026-09-07, see revision note**

This section predates both `specs/plans/2026-09-06-module-page-rework.md` (which deleted
`AppLayout.vue`'s `NAV_INTERFACES`-driven nav computation entirely, replacing it with
`src/moduleWidgets.ts`'s `MODULE_WIDGETS` registry + `widgetsForModule`) and the actual `pyobs-gui`
promotion rule this doc originally guessed at. As written, "a nav entry + route... for each
currently-online module, if it implements an auxiliary interface" would give a module implementing
*both* `IFilters` and `ITemperatures` with no camera/telescope **two separate nav entries** — the
exact per-interface nav fragmentation `module-page-rework.md` was written to eliminate, and not
what `pyobs-gui` itself does (it promotes every `sidebar_preferred` match into `main` at once, so
that module gets **one** page with two tabs, one nav entry).

Corrected mechanism, in current-architecture terms: extend `MODULE_WIDGETS`'
`ModuleWidgetEntry` with a `sidebarPreferred?: boolean` flag (mirrors `MainWidgetEntry.sidebar_preferred`
exactly) on the `IFilters`/`IFocuser`/`ITemperatures`/`ICooling` entries once they're registered.
`widgetsForModule` (`src/moduleWidgets.ts`) needs the actual promotion logic added — today it's a
plain `filter` with no demotion/promotion at all (see `specs/design/pyobs-gui-widget-parity.md`'s
note that this is already a latent bug waiting for these four widgets to land): split matches into
non-preferred and preferred, return non-preferred if non-empty, else return every preferred match
(so they become normal tabs on `ModulePageView.vue` — no separate `AuxiliaryView.vue`/nav-entry
mechanism needed at all, the existing per-module page machinery already does the right thing once
promotion exists). This is strictly simpler than what this section originally proposed.

## Not yet decided

- Exact `AUXILIARY_INTERFACES` config shape, and where `AuxiliaryWidgets`
  sits in each primary page's layout (its own collapsible section, like
  `CameraView.vue`'s Settings panel? Or just concatenated inline?).
- ~~A module implementing an auxiliary interface *and multiple* primary
  interfaces...~~ **Resolved by the section 2 revision**: a hypothetical camera+telescope+focuser
  module gets one `ModulePageView.vue` with Camera and Telescope tabs (both real `main` matches,
  `IFocuser` demoted either way since it's `sidebarPreferred`) and the Focuser widget in the shared
  section, visible regardless of which tab is active — no duplication question, since there's only
  ever one shared-section render per module page, not one per tab.
- Whether `IWindow`/`IBinning`/`IGain`/`IImageFormat`/`IImageType`
  (`2026-08-03-camera-page.md` phase 3's settings, currently hardcoded directly in
  `CameraView.vue`, not using this mechanism) should be retrofitted onto
  it for consistency. Arguably yes, but they're tightly
  exposure/camera-specific and less obviously "their own reusable widget"
  the way Cooling/Filters/Temperatures/Focuser are (no 1:1 `pyobs-gui`
  widget file each — they're all bundled into `camerawidget.py` itself).
  Worth revisiting once this mechanism exists and can be compared directly
  against phase 3's hardcoded approach, not decided now.
- Whether the fixed "primary interfaces" list ever gets a new entry because
  of this work (e.g. if `ITemperatures` usage in practice wants a richer
  dedicated page beyond the generic fallback) — punt for now; the fallback
  page is deliberately generic, not a permanent ceiling on what an
  auxiliary interface's page can become later.

## Implementation checklist (revised 2026-09-07 for the corrected mechanism)

- [x] `CoolingView.vue` (named to match this app's `*View.vue` convention, not the plan's original
      `CoolingWidget.vue`) — 2026-09-08.
- [ ] `FiltersView.vue`, `TemperaturesView.vue`, `FocuserView.vue`.
- [x] `ModuleWidgetEntry` gains `sidebarPreferred?: boolean` (`src/moduleWidgets.ts`) — 2026-09-08.
      `ICooling` registered with it set; register the remaining three the same way once built.
- [x] `widgetsForModule`'s promotion logic — 2026-09-08: split matches into non-preferred/preferred,
      return non-preferred if non-empty else every preferred match, per `collect_main_widgets`
      (`pyobs-gui/pyobs_gui/mainwindow.py`). A new `sidebarWidgetsForModule` returns the demoted half.
- [x] `ModulePageView.vue`'s shared-section slot — 2026-09-08: renders the demoted matches, each in
      its own labelled box (icon + uppercase interface label) so it's visually clear the content
      belongs to a separate attached widget, not the active tab. No separate
      `AuxiliaryWidgets.vue`/`AuxiliaryView.vue` needed, confirmed.
- [x] Manual verification against `DummyCamera` (`camera@localhost`) — 2026-09-08: demoted-to-
      shared-section case confirmed (`ICamera` + `ICooling`, one "Camera" tab, no separate "Cooling"
      tab, `CoolingView` renders in the shared section); `set_cooling` RPC confirmed working
      end-to-end, live state update observed (setpoint/power changed after Apply).
- [ ] Still needed: a module implementing only an auxiliary interface with no camera/telescope, to
      exercise the promoted-to-main (standalone) case — no such fixture exists yet.

## References

- `specs/design/pyobs-gui-widget-parity.md` — the `sidebar_preferred`/promotion-rule mechanism this
  plan's 2026-09-07 revision aligns to; read it before implementing.
- `pyobs-gui/specs/2026-08-28-gui-main-vs-sidebar-widgets.md` — D1 (the promotion rule itself), D2
  (shared sidebar as a page property).
- `pyobs-gui/pyobs_gui/coolingwidget.py`, `filterwidget.py`, `temperatureswidget.py`,
  `focuswidget.py` — the four widgets themselves, unchanged by the 2026-09-07 revision.
- `specs/plans/2026-09-06-module-page-rework.md` — `ModulePageView.vue`'s shared-section slot,
  where the demoted widgets actually render.
