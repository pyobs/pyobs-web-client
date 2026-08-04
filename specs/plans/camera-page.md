# Plan: Camera page — grab & display images from `ICamera` modules

Status: split into four phases (below). Phases 1-2 done and live-verified
(including two real bugs found and fixed along the way — see their
sections). Phases 3-4 not yet designed in detail.
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

**Live-verified, with two real bugs found and fixed along the way, plus one
still-open external blocker:**

- **RPC transport bug (fixed in `useXmpp.ts`), affects more than Camera.**
  `grab_data()` was the first slow, `timeout`-decorated RPC call this client
  had ever issued. `pyobs-core`'s `xmppcomm.py` responds to those in two
  stages: an immediate `<methodTimeout>` ack (buying more time, reusing the
  *same* IQ id), then a second, separate, unsolicited `<iq>` — same id —
  carrying the real `<methodResponse>`/`<fault>`. Strophe's one-shot
  `sendIQ` resolves on the first id match and never sees the second, so
  `executeMethod` silently returned `{success: true, value: null}` — the
  actual grab happened server-side, the client just never learned the
  result. Fixed with a new `sendRpcIQ()` using a persistent
  `Strophe.addHandler` that filters out `methodTimeout` acks and only
  resolves on the real response. Confirmed live against `DummyCamera`.
  Any other slow RPC call anywhere in this app would have hit the same
  bug — this wasn't Camera-specific, just the first path to exercise it.
- **VFS `HttpFile` LocalFile-only test config gap**: `xmpp/camera.yaml`'s
  original `cache` VFS root was `pyobs.vfs.LocalFile` (copied from
  `pyobs-gui`'s own test config) — unreachable from a browser. Added
  `testing/pyobs-gui-configs/xmpp/httpfilecache.yaml` (`HttpFileCache`, no
  XMPP account needed — it's a plain HTTP server, not RPC-callable) and
  repointed `camera.yaml`'s `cache` root at it via `HttpFile`.
- **CORS blocker: resolved upstream.** Filed as
  [pyobs/pyobs-core#725](https://github.com/pyobs/pyobs-core/issues/725);
  fixed same-day in `pyobs-core` commit `9bb4314b` (adds CORS headers to
  `HttpFileCache`, plus an unrelated auth gap the fix surfaced — see below).
  **Full round trip now confirmed live**: Expose → RPC → real VFS path →
  fetch → gunzip → FITS decode → canvas render, no errors, real pixel data
  (`DummyCamera`'s simulated sensor noise), verified at both desktop and
  mobile (390×844, no horizontal overflow, canvas scales to fit) viewports.
  Tested against `../pyobs-core` installed *editably* into `testing/.venv`
  (`uv pip install --python testing/.venv -e '../pyobs-core[full]'`,
  2.0.0.dev60) since the fix isn't in a published release yet — this
  diverges from `specs/steering/testing-against-live-backend.md`'s pinned
  `2.0.0.dev53`; re-pin that doc to the real release once one exists.
- **Auth-model mismatch, found via the same upstream commit.** Fixing CORS
  surfaced that `HttpFileCache` never actually checked the Basic Auth
  credentials `pyobs.vfs.HttpFile` was sending — so `9bb4314b` also
  replaced Basic Auth (`username`/`password`) with an opt-in Bearer token
  (`token` param) across both `HttpFileCache` and `HttpFile`. This client's
  `useVfsConfig.ts`/`SettingsView.vue`/`CameraView.vue` still model the old
  `username`/`password` Basic Auth shape (per
  `specs/design/login-memory-and-vfs-config.md`) — harmless for the no-auth
  case just tested (no token configured server-side), but stale for any
  deployment that turns auth on. Not fixed as part of this plan — needs its
  own follow-up once the pyobs-core release ships, touching a design
  previously marked "done."

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

- [x] **Library decision reversed**: not `fitsjs`. Hands-on investigation
      (see git history on this branch) found `fitsjs` untyped, CJS-only,
      and — critically — its actual pixel-decode path spins up a Web Worker
      via a Blob URL, which can't be unit-tested under jsdom. Two other npm
      candidates (`fits-reader`, `fits-reader-js`) were also rejected
      (Node-only / undocumented minified blob respectively). Hand-rolled a
      minimal parser instead, in a new npm-workspace package
      **`packages/pyobs-fits`** (zero dependencies, framework-agnostic, own
      README explaining why it's in-tree rather than a separate repo for
      now) — covers exactly `grab_data()`'s actual output (single
      uncompressed 2D image HDU), not the full FITS standard. 14 unit tests,
      all passing.
- [x] Confirmed `DecompressionStream('gzip')` handles the `.fits.gz` case
      end to end (`packages/pyobs-fits/src/gzip.ts`, tested in
      `gzip.spec.ts` against real `CompressionStream` output); passes
      non-gzip bytes through unchanged.
- [x] Standalone widget (`src/components/FitsCanvas.vue`) decodes +
      rasterizes to `<canvas>`, verified against a static synthetic fixture
      in a real browser (Vite dev server, manual pass) — confirmed correct
      vertical flip (FITS row 1 = bottom) and stretch.
- [x] Canvas sizing: `max-width:100%`, height auto — confirmed with an
      actual mobile-viewport (390×844) screenshot pass, no horizontal
      overflow, canvas scales to fit.

Phase 2:

- [x] `CameraView.vue`: module list + card, mirroring `RoofView.vue`'s
      structure (status dot, name/jid header, `ModuleStateCard` for
      `IExposure`, action buttons, inline error alert on fault).
- [x] Expose button → `executeMethod(..., 'grab_data', ...)` → on success,
      resolve VFS path, fetch bytes, hand off to the phase 1 widget.
- [x] Manual verification against `DummyCamera` (`../pyobs-core`) — found
      and fixed the `sendRpcIQ` transport bug above; confirmed `grab_data()`
      returns a real path over the wire.
- [x] Full fetch-and-render round trip against a real file — confirmed live
      once pyobs/pyobs-core#725 landed (see above).
- [x] Canvas sizing on an actual mobile-viewport (390×844) screenshot pass.

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
