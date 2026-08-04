# Plan: Camera page — grab & display images from `ICamera` modules

Status: proposed, not yet implemented.
Repos: pyobs-web-client (all implementation here)

Supersedes DEVELOPMENT.md's "Proposed: Camera page" section (kept there as
historical record, not deleted) — this plan is the current source of truth for
scope and open questions going forward.

## Problem statement

`ICamera` modules (`IData` + `IExposure`, confirmed against
`../pyobs-core/pyobs/interfaces/ICamera.py`) can already be operated fully
through `ShellView.vue`'s generic RPC forms — every param (windowing, binning,
gain, filters, image format/type) is just an RPC call or a param form Shell
already builds from live command schema. What's missing is the one thing Shell
can't do at all: *see the resulting image*. `grab_data()` returns a VFS path to
a raw FITS file; nothing in this client parses or renders FITS today.

## Scope (v1)

- New page `CameraView.vue` + sidebar nav entry, listing every currently-online
  module implementing `ICamera`, same list/card pattern as `RoofView.vue`
  (`modules.value.filter((m) => 'ICamera' in m.interfaces)`, sorted by name).
- Per module: an "Expose" button calling `grab_data()` via `executeMethod`
  (same pattern as `RoofView.vue`'s `run()`), with `ModuleStateCard` for
  `IExposure`'s live `ExposureState` (`status`/`progress`/`exposure_time_left`)
  shown while exposing — no new state-rendering code, this is the exact
  existing component used for `IMotion` in `RoofView.vue`.
- On `grab_data()` returning successfully: resolve the returned path via
  `resolveVfsPath()` (`useVfsConfig.ts:63`), fetch the bytes, decode+render as
  described below.
- **Single-shot only.** `IDataSequence` (`grab_sequence`/`abort_sequence`, "grab
  N images") is explicitly out of scope for v1 — own follow-up plan once this
  path is proven, not folded in now. Rationale: keeps this plan's surface area
  to one new mechanic (FITS decode/render) instead of two.
- **Own-triggered images only.** No `NewImageEvent` subscription in v1 — the
  page only shows an image after its own Expose button's `grab_data()` call
  returns. An image taken by another client/script while this page is open
  does not appear. Follow-up if/when shared-observing-session use comes up.
- **Mobile**: rendered image must scale to viewport (`max-width:100%` on the
  canvas, not a fixed pixel size). Panning/zooming a full-resolution image on a
  small screen is out of scope for v1 — scaled-to-fit static view only.

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

- [ ] Add `fitsjs` as a dependency; confirm its actual public API against the
      installed package (README/docs at implementation time) rather than this
      plan's assumptions — not yet verified hands-on.
- [ ] Confirm `DecompressionStream('gzip')` (or an equivalent) handles the
      `.fits.gz` case end to end; fall back to detecting uncompressed `.fits`
      and skipping decompression.
- [ ] `CameraView.vue`: module list + card, mirroring `RoofView.vue`'s
      structure (status dot, name/jid header, `ModuleStateCard` for
      `IExposure`, action buttons, inline error alert on fault).
- [ ] Expose button → `executeMethod(..., 'grab_data', ...)` → on success,
      fetch + decompress + decode + rasterize to `<canvas>`.
- [ ] Canvas sizing: `max-width:100%`, height auto, verified with an actual
      mobile-viewport (390×844) screenshot pass per
      `specs/steering/mobile-and-desktop.md`.
- [ ] Manual verification against a real/dummy `ICamera` module (e.g.
      `DummyCamera` in `../pyobs-core`, if one exists — confirm before relying
      on it) rather than only unit-testing the codec in isolation.

## Not yet decided / explicitly deferred

- `IDataSequence` support (deferred to its own plan, see Scope above).
- `NewImageEvent` live auto-refresh (deferred, see Scope above).
- zscale stretch (deferred pending real image output to judge min/max against).
- Whether large full-frame images need a mobile-specific fallback (downsample
  before decode) if decode/rasterize proves too slow or memory-heavy on phone
  hardware — genuinely unknown until tested against a real frame size, not
  assumed either way.
- Full `pyobs-gui` `CameraWidget` parity (windowing, binning, gain, filters,
  cooling, image format/type) — deliberately not in scope; those are already
  generic RPC/param forms Shell handles today, this page's job stays "grab an
  image and see it."

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
