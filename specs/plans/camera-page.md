# Plan: Camera page — grab & display images from `ICamera` modules

Status: split into three phases (below), all done and live-verified
(including real bugs found and fixed along the way — see their sections).
A fourth phase (temperature/cooling status, `ICooling`) was scoped
originally but scrapped from this plan — deliberately taken up later as
its own thing, not because it's unwanted.

Repos: pyobs-web-client (all implementation here)

Supersedes DEVELOPMENT.md's "Proposed: Camera page" section (kept there as
historical record, not deleted) — this plan is the current source of truth for
scope and open questions going forward.

**Phasing.** Originally scoped as one v1 pass; split into phases to
de-risk the actual hard part (FITS decode/render) before wiring it to a live
page, and to sequence the page's growth from "grab and view" toward
`pyobs-gui` `CameraWidget` parity:

1. **FITS-display widget**, standalone — decode/render pipeline only, no
   camera page yet.
2. **Camera page**: `CameraView.vue` + Expose button + the phase 1 widget
   wired to a live `grab_data()` call.
3. **Interface groups**: dedicated controls for `IWindow`/`IBinning`/gain/
   filters/image format/type — reverses this plan's original call to leave
   these to Shell's generic RPC forms (see "Scope reversal" note below).

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

**Done, live-verified, two real bugs found and fixed along the way.**

**Scope reversal.** This plan originally ruled out dedicated controls for
`IWindow`/`IBinning`/gain/filters/image format/type, reasoning that Shell's
generic RPC param forms already handle them and the page's job should stay
"grab an image and see it" (see the old "Not yet decided / explicitly
deferred" section this replaced). Decision reversed: built dedicated
controls directly on `CameraView.vue`, grounded in `pyobs-gui`'s
`camerawidget.py` for which interfaces group together.

**Two design questions this plan left open, resolved with the user before
implementing:**

- **Apply model — batched, matches `pyobs-gui`, not one Set button per
  interface.** Considered and rejected reusing this app's own Shell/Events
  idiom (`ParamForm.vue` + a "Set" button per interface, applied
  immediately) — six independent buttons is worse UX than one combined
  form. Instead: all fields staged in one form (`settingsParams`), applied
  as one RPC call per configured interface immediately before each
  `grab_data()` call, matching `camerawidget.py:271-330` — no separate
  "apply settings" step at all, matching or missing settings groups affect
  nothing until the next Expose.
- **Layout — separate collapsible panel**, not inline on the main card —
  keeps the card focused on status + Expose; a "Settings" toggle reveals
  the per-interface form group, closed by default.
- **`IFilters` deferred** — `DummyCamera` doesn't implement it, so it
  couldn't be live-verified; left for whenever a real filter-wheel-equipped
  module is available.

**Interfaces covered**: `IWindow` (left/top/width/height), `IBinning`
(x/y), `IImageFormat` (fmt, enum), `IExposureTime` (exposure_time),
`IGain` (two separate commands, `set_gain`+`set_offset`, combined into one
form group), `IImageType` (image_type, enum) — each independently gated on
`interfaceName in currentModule.interfaces`, reusing `ParamForm.vue` purely
for field rendering (not its per-command-submit flow). `pyobs-gui`'s
live-state-sync (subscribing to each interface's own state to keep the
form in sync with other clients) and capabilities-populated dropdowns
(binning combo from `binnings` list, format combo from capabilities) were
**not** built — left as a follow-up if the current guessed-defaults
approach (below) proves confusing in practice, not because they're hard,
just out of this pass's scope.
- `IDataSequence`/broadcast toggle (`camerawidget.py:331-349`) is
  `pyobs-gui` scope, not this phase — stays deferred per this plan's
  existing single-shot-only call (see Phase 2).

**Two real bugs found via live testing against `DummyCamera`, both the same
root cause**: `defaultParamValue()`'s generic blank/zero seeding is fine for
Shell (a human always reviews params before Execute) but wrong for a panel
meant to work with zero configuration:

1. Required enum fields (`IImageFormat.set_image_format`'s `fmt`) seeded
   blank → server rejected the very first Expose with
   `'' is not a valid ImageFormat`. Fixed by seeding required enums with
   their first available option instead.
2. `IWindow`'s `width`/`height` seeded `'0'` (the generic non-optional-number
   default) → a zero-size window crashed `grab_data()` deep in
   `DummyCamera`'s image generation (`zero-size array to reduction
   operation minimum which has no identity`). Fixed with capability-aware
   seeding: `IWindow` defaults to the module's full frame
   (`WindowCapabilities.full_frame_*`), `IBinning` defaults to 1×1.

Confirmed live end-to-end after both fixes: all six settings groups
rendered, custom exposure time (3s) and gain (42) values applied, guessed
defaults (full-frame window, 1×1 binning, first enum option for
format/type) all accepted server-side — `camera.log` shows every
`set_*` call landing before a clean `grab_data()` completion, no errors on
the client.

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

Phase 3:

- [x] `settingsGroups` computed: `IWindow`/`IBinning`/`IImageFormat`/
      `IExposureTime`/`IGain`/`IImageType`, each gated on
      `interfaceName in currentModule.interfaces`, built from the module's
      own command schemas (no hardcoded field lists).
- [x] Collapsible "Settings" panel, `ParamForm.vue` per group, capability-
      and enum-aware default seeding (see the two bugs found above).
- [x] `expose()` applies every configured group's RPC(s) before
      `grab_data()`, aborting (no grab) on the first `set_*` failure.
- [x] Manual verification against `DummyCamera` — found and fixed both
      seeding bugs above; confirmed all six groups apply correctly and a
      full Expose completes cleanly with both defaulted and custom values.

## Not yet decided / explicitly deferred

- `IDataSequence` support (deferred to its own plan, see Phase 2 above).
- `NewImageEvent` live auto-refresh (deferred, see Phase 2 above).
- zscale stretch (deferred pending real image output to judge min/max against).
- Whether large full-frame images need a mobile-specific fallback (downsample
  before decode) if decode/rasterize proves too slow or memory-heavy on phone
  hardware — genuinely unknown until tested against a real frame size, not
  assumed either way.
- **Temperature/cooling status** (`ICooling`/`ITemperatures`) — scoped
  originally as this plan's phase 4, scrapped from here deliberately, to be
  picked up later as its own thing (own plan doc, when that happens).

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
