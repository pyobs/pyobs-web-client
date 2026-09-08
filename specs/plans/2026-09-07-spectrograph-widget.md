# Plan: Spectrograph widget (`ISpectrograph`)

Status: built (`SpectrographView.vue`) — 2026-09-08. Live-verification is now Tim's own testing
pass rather than an open web-client task tracked here; file an issue for anything it turns up.

Repos: pyobs-web-client (all implementation here)

## Context

Registry row 11 in `specs/design/pyobs-gui-widget-parity.md`. `ISpectrograph` (`IData` +
no other required interfaces — see `pyobs-core/pyobs/interfaces/ISpectrograph.py`, effectively an
empty marker interface beyond `grab_data`) is the smallest gap to close of the four missing
widgets: `spectrographwidget.py` is `CameraView.vue`'s Phase 2 (expose/abort/status/progress) with
no Phase 3 equivalent at all — no window/binning/gain/image-format settings, because a spectrograph
module has no such controls to speak of.

## Scope

`SpectrographView.vue`, new — copy `CameraView.vue`'s shape, minus its Phase 3 settings panel:

- `IExposure` subscription → curated `StatusRow` (`status`, `progress` as a progress bar,
  `exposure_time_left`) — identical curation to `CameraView.vue`'s corrected version (see
  `specs/plans/2026-09-07-widget-visual-redesign.md`), same interface.
- Count field + broadcast checkbox (`spinCount`/`checkBroadcast` in `spectrographwidget.py`) — a
  sequence of `count` spectra taken client-side in a loop, exactly `CameraView.vue`'s own
  `exposures_left` counting loop shape before Phase 3 added settings on top of it, or
  `videograbwidget.py`'s simpler loop (no per-shot settings to reapply).
- Grab/Abort buttons: Grab → `grab_data` (via `IData`) in the count loop; Abort → `IAbortable`,
  shown only when the module implements it (`butAbort.setVisible` in the reference) — mirrors
  `AutoFocusView.vue`/`AcquisitionView.vue`'s existing `IAbortable` gating exactly, same pattern.
- `FitsCanvas.vue` display of the last-grabbed spectrum — reuse as-is; a spectrum is still a FITS
  file over the wire (1D or 2D), no new display component needed unless `FitsCanvas.vue` turns out
  to render a 1D spectrum's data array poorly (verify against a real `ISpectrograph` fixture before
  assuming it needs changes — `testing/pyobs-gui-configs/xmpp/spectrograph.yaml` exists but per
  `specs/steering/open-items.md` is stale, `name:` not yet renamed to `label:`).

## Registry

One new `MODULE_WIDGETS` entry, `ISpectrograph` → `SpectrographView`, in `src/moduleWidgets.ts`.

## Out of scope

- Any window/binning/gain/image-format settings — `spectrographwidget.py` has none, and no
  `ISpectrograph` module in the fleet is known to need them; if one turns up, follow
  `CameraView.vue`'s Phase 3 settings-group pattern rather than inventing a new one.

## References

- `pyobs-gui/pyobs_gui/spectrographwidget.py` — the widget this adapts.
- `specs/design/pyobs-gui-widget-parity.md` — registry row 11.
- `specs/plans/2026-08-03-camera-page.md`, `CameraView.vue` — the settings-free subset of this
  pattern (Phase 2, before Phase 3 added camera-specific controls) is the closest existing analog.
- `specs/plans/2026-09-07-widget-visual-redesign.md` — the `IExposure` curation this reuses.
