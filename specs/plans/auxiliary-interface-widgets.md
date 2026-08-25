# Plan: auxiliary interface widgets (attach-or-standalone)

Status: proposed, not yet implemented.
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
  `specs/plans/camera-page.md`'s phase 3 did for `ICamera` specifically
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
  (per `camera-page.md`'s dropped phase 4 note — this plan supersedes
  that note; `ITemperatures` is scoped here now, not as a Camera-specific
  follow-up).
- **`FocuserWidget.vue`** (`IFocuser` — confirmed against `pyobs-core`;
  there is no `IFocus`) — `pyobs_gui/focuswidget.py`. Also extends
  `IMotion`, same motion-status gating as Filters. Two independent values
  (`FocuserState.focus`, `.focus_offset`) + a "reset offset to 0" action
  alongside `set_focus`/`set_focus_offset`.

### 2. Registry + auto-attach

A single `AUXILIARY_INTERFACES` config, same shape as `AppLayout.vue`'s
existing `NAV_INTERFACES`, mapping interface name → `{ component, title,
icon }`. A new shared `AuxiliaryWidgets.vue` component takes a module prop
and internally loops `AUXILIARY_INTERFACES`, rendering whichever entries
`interfaceName in module.interfaces` — dropped into every existing primary
page (`RoofView`, `CameraView`, `ModeView`, `WeatherView`, `AutoFocusView`,
`AutoGuidingView`, `AcquisitionView`) as one new line each, no per-page
bespoke wiring.

### 3. Standalone fallback page + nav

Extend `AppLayout.vue`'s nav computation: for each currently-online module,
if it implements an auxiliary interface but *none* of the primary ones, it
needs a nav entry + route pointing at a new generic `AuxiliaryView.vue`
(parameterized by interface name + jid), internally reusing the same
`AuxiliaryWidgets` rendering. Nav entry title/icon come from
`AUXILIARY_INTERFACES`' own config — same shape `NAV_INTERFACES` already
provides for primary interfaces, so the sidebar's existing
single-instance/multi-instance rendering logic (one link vs. a section
header + sub-links) can be reused rather than duplicated.

## Not yet decided

- Exact `AUXILIARY_INTERFACES` config shape, and where `AuxiliaryWidgets`
  sits in each primary page's layout (its own collapsible section, like
  `CameraView.vue`'s Settings panel? Or just concatenated inline?).
- A module implementing an auxiliary interface *and multiple* primary
  interfaces (hypothetical camera+telescope combo with `IFocuser`) — does
  the widget render on both primary pages? Leaning yes, no extra work
  needed: `AuxiliaryWidgets` only ever asks "does *this page's* module
  implement this interface," so it renders wherever it's dropped in,
  independently, with no shared/global state to duplicate.
- Whether `IWindow`/`IBinning`/`IGain`/`IImageFormat`/`IImageType`
  (`camera-page.md` phase 3's settings, currently hardcoded directly in
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

## Implementation checklist

- [ ] `CoolingWidget.vue`, `FiltersWidget.vue`, `TemperaturesWidget.vue`,
      `FocuserWidget.vue`.
- [ ] `AUXILIARY_INTERFACES` config + `AuxiliaryWidgets.vue`.
- [ ] Wire `AuxiliaryWidgets` into every existing primary page.
- [ ] `AuxiliaryView.vue` fallback page + route + `AppLayout.vue` nav
      extension for auxiliary-only modules.
- [ ] Manual verification against `DummyCamera` (already implements
      `ICooling`; a live test config could add `IFilters`/`IFocuser` to
      exercise the attach case) *and* at least one module implementing
      only an auxiliary interface, to exercise the standalone-fallback
      case.
