# Plan: Camera page — grab & display images from `ICamera` modules

Status: proposed, not yet implemented. Split into four phases (below);
none started.
Repos: pyobs-web-client (all implementation here)

Supersedes DEVELOPMENT.md's "Proposed: Camera page" section (kept there as
historical record, not deleted) — this plan is the current source of truth for
scope and open questions going forward.

**Phasing.** Originally scoped as one v1 pass; split into four phases to
de-risk the actual hard part (FITS decode/render) before wiring it to a live
page, and to sequence the page's growth from "grab and view" to full
`pyobs-gui` `CameraWidget` parity:

1. **FITS-display widget**, standalone — decode/render pipeline only, no
   camera page yet.
2. **Camera page**: `CameraView.vue` + Expose button + the phase 1 widget
   wired to a live `grab_data()` call.
3. **Interface groups**: dedicated controls for `IWindow`/`IBinning`/gain/
   filters/image format/type — reverses this plan's original call to leave
   these to Shell's generic RPC forms (see "Scope reversal" note below).
4. **Temperature/cooling status**: `ICooling` controls.

Each phase's own scope/checklist is under its own heading below; shared
material (FITS handling, cross-check against `pyobs-polaris`) is unchanged
and applies mainly to phases 1-2.

## Problem statement

`ICamera` modules (`IData` + `IExposure`, confirmed against
`../pyobs-core/pyobs/interfaces/ICamera.py`) can already be operated fully
through `ShellView.vue`'s generic RPC forms — every param (windowing, binning,
gain, filters, image format/type) is just an RPC call or a param form Shell
already builds from live command schema. What's missing is the one thing Shell
can't do at all: *see the resulting image*. `grab_data()` returns a VFS path to
a raw FITS file; nothing in this client parses or renders FITS today.

## Phase 1: FITS-display widget

Standalone decode/render pipeline — a component that takes FITS bytes and
rasterizes them, with no camera page, module list, or `grab_data()` call yet.
Verify against a static fixture file first (a `.fits`/`.fits.gz` sample
committed to the repo or fetched from a fixed path), not a live module — that
dependency belongs to phase 2.

- **Mobile**: rendered image must scale to viewport (`max-width:100%` on the
  canvas, not a fixed pixel size). Panning/zooming a full-resolution image on a
  small screen is out of scope for phase 1 — scaled-to-fit static view only.
- See "FITS handling" below for library choice, stretch, and gzip handling —
  all phase 1 concerns.

## Phase 2: Camera page

- New page `CameraView.vue` + sidebar nav entry, listing every currently-online
  module implementing `ICamera`, same list/card pattern as `RoofView.vue`
  (`modules.value.filter((m) => 'ICamera' in m.interfaces)`, sorted by name).
- Per module: an "Expose" button calling `grab_data()` via `executeMethod`
  (same pattern as `RoofView.vue`'s `run()`), with `ModuleStateCard` for
  `IExposure`'s live `ExposureState` (`status`/`progress`/`exposure_time_left`)
  shown while exposing — no new state-rendering code, this is the exact
  existing component used for `IMotion` in `RoofView.vue`.
- On `grab_data()` returning successfully: resolve the returned path via
  `resolveVfsPath()` (`useVfsConfig.ts:63`), fetch the bytes, decode+render via
  the phase 1 widget.
- **Single-shot only.** `IDataSequence` (`grab_sequence`/`abort_sequence`, "grab
  N images") is explicitly out of scope for phase 2 — own follow-up plan once
  this path is proven, not folded in now. Rationale: keeps this phase's
  surface area to wiring, not a second new mechanic.
- **Own-triggered images only.** No `NewImageEvent` subscription in phase 2 —
  the page only shows an image after its own Expose button's `grab_data()`
  call returns. An image taken by another client/script while this page is
  open does not appear. Follow-up if/when shared-observing-session use comes
  up.

## Phase 3: Interface groups

**Scope reversal.** This plan originally ruled out dedicated controls for
`IWindow`/`IBinning`/gain/filters/image format/type, reasoning that Shell's
generic RPC param forms already handle them and the page's job should stay
"grab an image and see it" (see the old "Not yet decided / explicitly
deferred" section this replaces). Decision reversed: build dedicated controls
for these directly on `CameraView.vue`. Not yet designed in detail — form
layout, whether inline on the module card or a per-module settings panel —
but `pyobs-gui`'s `camerawidget.py` (`../pyobs-gui/pyobs_gui/camerawidget.py`)
is a concrete reference for both which interfaces group together and the
capability/state pattern to follow:

- **Per-interface, each independently optional** (checked via
  `has_proxy`/gated on `m.interfaces`, exactly this client's existing
  pattern elsewhere): `IWindow` (left/top/width/height, capped by
  `get_capabilities`' `full_frame_*`), `IBinning` (binning combo, populated
  from capabilities' `binnings` list), `IImageFormat` (format combo from
  capabilities), `IExposureTime` (exposure time + unit), `IGain`
  (gain/offset), `IImageType` (OBJECT/BIAS/DARK/FLAT combo), `IFilters`
  (filter select — `pyobs-gui` gives it its own sidebar `FilterWidget`
  rather than folding into the main form).
- Values are set immediately before each `expose()` call from the current
  form state (`camerawidget.py:271-330`), not as a separate "apply settings"
  step — worth deciding whether to match that or make settings persist
  independently of exposing.
- `pyobs-gui` also subscribes to each interface's own state (`_update_binning`,
  `_update_gain`, etc.) to keep the form in sync if changed elsewhere (e.g.
  another client) — same live-sync expectation this client already applies
  to `ModuleStateCard`.
- `IDataSequence`/broadcast toggle (`camerawidget.py:331-349`) is `pyobs-gui`
  scope, not this phase — stays deferred per this plan's existing
  single-shot-only call (see Phase 2).

## Phase 4: Temperature/cooling status

Two separate interfaces, per `pyobs-gui`'s split into `CoolingWidget`
(`../pyobs-gui/pyobs_gui/coolingwidget.py`) and `TemperaturesWidget`
(`../pyobs-gui/pyobs_gui/temperatureswidget.py`) — worth keeping separate
here too rather than merging into one "temperature" panel, since they're
different interfaces with different shapes:

- **`ICooling`**: single setpoint control — enabled toggle + target
  temperature, `set_cooling(enabled, temp)`; status display shows current
  setpoint and cooler power (`%`) when enabled, "OFF" when not
  (`coolingwidget.py:36-42`).
- **`ITemperatures`**: read-only, multiple named sensor readings
  (`state.readings`, each `{name, value}`) plus a history plot
  (`temperaturesplotwidget.py`) — this is near-identical in shape to
  `WeatherView.vue`'s already-built per-sensor tile + bounded history-array
  pattern (see `specs/plans/weather-widget.md`); reuse that pattern/its
  `TimeSeriesChart.vue` rather than building a second one from scratch.

## FITS handling

**Library: `fitsjs`** (`astrojs/fitsjs` on GitHub) — chosen over hand-rolling a
parser or embedding full JS9. Reasoning (see conversation/commit history for
the fuller comparison): fitsjs is the parsing library JS9 itself is built on,
so it has real astronomical-FITS track record (compressed images, data cubes,
binary/ascii tables) beyond a minimal header+pixel-array parser; full JS9 was
rejected because it assumes a JS9-aware backend proxy for loading arbitrary
URLs (this client has no server component and isn't gaining one for this), and
its bundled toolbar/region-editing UI doesn't fit this app's minimal
expose-and-view design.

**v1 stretch: min/max only.** Linear stretch between the decoded pixel array's
own min and max value. Deliberately not zscale (the DS9/`QFitsWidget`
convention) for v1 — min/max is enough to prove the decode→render pipeline
works end to end; zscale is a follow-up once real image output from actual
camera hardware is available to judge whether min/max is actually unusable in
practice or good enough to ship.

**Gzip**: `grab_data()`'s returned path is frequently `.fits.gz` (raw FITS,
unconverted — confirmed no server-side preview/thumbnail conversion exists
anywhere in `../pyobs-core`). `fetch()` won't transparently decompress a
`.gz`-suffixed file unless the HTTP server sets `Content-Encoding: gzip`, which
this client can't rely on — needs client-side gzip decompression (e.g.
`DecompressionStream('gzip')`, available in all browsers this project already
targets) before handing bytes to fitsjs.

## Implementation checklist

Phase 1:

- [ ] Add `fitsjs` as a dependency; confirm its actual public API against the
      installed package (README/docs at implementation time) rather than this
      plan's assumptions — not yet verified hands-on.
- [ ] Confirm `DecompressionStream('gzip')` (or an equivalent) handles the
      `.fits.gz` case end to end; fall back to detecting uncompressed `.fits`
      and skipping decompression.
- [ ] Standalone widget: decode + rasterize to `<canvas>`, verified against a
      static fixture file (not yet a live module).
- [ ] Canvas sizing: `max-width:100%`, height auto, verified with an actual
      mobile-viewport (390×844) screenshot pass per
      `specs/steering/mobile-and-desktop.md`.

Phase 2:

- [ ] `CameraView.vue`: module list + card, mirroring `RoofView.vue`'s
      structure (status dot, name/jid header, `ModuleStateCard` for
      `IExposure`, action buttons, inline error alert on fault).
- [ ] Expose button → `executeMethod(..., 'grab_data', ...)` → on success,
      fetch + decompress + decode + rasterize via the phase 1 widget.
- [ ] Manual verification against a real/dummy `ICamera` module (e.g.
      `DummyCamera` in `../pyobs-core`, if one exists — confirm before relying
      on it) rather than only unit-testing the codec in isolation.

Phase 3 and phase 4 checklists: not yet written — each needs its own design
pass first (see those sections above).

## Not yet decided / explicitly deferred

- `IDataSequence` support (deferred to its own plan, see Phase 2 above).
- `NewImageEvent` live auto-refresh (deferred, see Phase 2 above).
- zscale stretch (deferred pending real image output to judge min/max against).
- Whether large full-frame images need a mobile-specific fallback (downsample
  before decode) if decode/rasterize proves too slow or memory-heavy on phone
  hardware — genuinely unknown until tested against a real frame size, not
  assumed either way.

## Cross-check against `pyobs-polaris`'s independent `ICamera` implementation

`pyobs-polaris` (a sibling client on this project's exact architecture)
already shipped its own FITS decode/display pipeline (`fits::FitsImage` via
`cfitsio`, `fits::FitsImageItem` for display — see its `DEVELOPMENT.md`'s
"FITS decode"/"Image display widget" sections), independently arriving at
the same **min/max-or-percentile-clip** stretch choice for its own first
pass, not the full zscale/DS9 convention — cross-validates this plan's own
min/max-for-v1 call as a reasonable industry-standard-adjacent default, not
just this project's own guess. Its zoom/pan is handled at the UI layer (a
`Flickable` wrapping a resizable item), not reimplemented — worth the same
approach here if/when panning is ever added (CSS transform/scroll on the
canvas's container, not a custom gesture-math reimplementation).

Two related things `pyobs-polaris` explicitly scoped **out** of its own
`ICamera` work, worth naming here rather than silently duplicating effort
later if they ever come up:

- **`FitsHeadersWidget`-style header injection is a fundamentally different
  problem, not a lighter version of this plan.** `pyobs-gui`'s
  `fitsheaderswidget.py` doesn't display headers of an already-taken image —
  it lets a human operator supply `OBJECT`/`USER`/custom FITS header values
  *before* an exposure, by having the GUI itself answer an incoming
  `IFitsHeaderBefore`-style RPC call from the exposing module. That means
  the client would have to become an RPC **responder** (a peer module on
  the XMPP network), not just an RPC caller/state subscriber — something
  this client (and `pyobs-polaris`) has never done in any form. `pyobs-polaris`
  recorded this as intentionally out of scope for exactly this reason, not
  merely deferred; treat it the same way here if it ever comes up — it
  deserves its own architectural discussion, not a quick addition to this
  plan.
- **`ISpectrograph` is a different device family, not a Camera-page
  variant.** Confirmed against `../pyobs-core/docs/source/whatsnew-2.0.rst`
  ("`ICamera`/`ISpectrograph` no longer imply `IExposure`") and
  `pyobs-gui`'s `spectrographwidget.py`: a spectrograph module is
  `IData + IExposure` too, and its widget is almost identical in shape to
  this plan's own v1 scope (grab, show live `ExposureState`, abort) — but
  it's a genuinely separate interface (`ISpectrograph`, not `ICamera`), and
  `pyobs-polaris` explicitly called this out as "worth a separate widget of
  its own if ever needed," not folded into its `ICamera` work either. Not
  planned here; if a real spectrograph module needs client support, it
  should get its own short plan (likely near-identical to this one, minus
  any camera-specific display nuance) rather than being bolted onto this
  page.
