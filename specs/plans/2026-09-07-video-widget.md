# Plan: Video widget (`IVideo` — Live View + FITS Image)

Status: built (`VideoView.vue`, `VideoGrabView.vue`) — 2026-09-08. Live-verification is now Tim's
own testing pass rather than an open web-client task tracked here; file an issue for anything it
turns up. No token-protected `IVideo` fixture exists yet, so the bearer-token open question below
is still unresolved (surfaced as a message in the UI rather than guessed at). `videograbwidget.py`
also references a `comboImageFormat` combo box that doesn't exist in its own `.ui` file — dead
code, not reproduced in `VideoGrabView.vue`.

Repos: pyobs-web-client (all implementation here)

## Context

`IVideo` is registry rows 9-10 in `specs/design/pyobs-gui-widget-parity.md` — the only two-widget
interface in `pyobs-gui`'s `MAIN_WIDGETS` (two independent tabs, "Live View" and "FITS Image", not
a main+sidebar pair — the earlier `paired_sidebar_widget` design for this was superseded before it
shipped, see that doc). No web-client equivalent exists today.

`pyobs-gui`'s `videowidget.py` (Live View) does real work this client doesn't have to: it opens a
raw TCP/TLS socket, sends a manual `GET ... HTTP/1.0` request, and hand-parses MJPEG multipart
boundaries into `QPixmap` frames — because Qt has no native MJPEG decoder. **A browser does** — an
MJPEG-over-HTTP multipart stream (`Content-Type: multipart/x-mixed-replace`) plays natively in a
plain `<img>` tag in Chrome, Firefox, and Safari. This whole widget is dramatically simpler here:
point `<img :src>` at the resolved stream URL, no socket/parsing code needed at all.

`videograbwidget.py`'s (FITS Image) grab/display half is functionally a scoped-down `CameraView.vue`:
image type + count + broadcast, grab/abort, `FitsCanvas` display — no window/binning/gain/format
controls (`IVideo` doesn't imply those interfaces the way `ICamera` modules often have them; add
them only if a real `IVideo` module in the fleet also implements one, following `CameraView.vue`'s
own settings-group pattern for whichever shows up).

## Scope

### Live View tab (`VideoView.vue`, new)

- Resolve the stream URL from `IVideo`'s `VideoCapabilities.mjpeg` (a VFS path) through
  `useVfsConfig.ts`'s `resolveVfsEndpoint` — same mechanism `CameraView.vue` already uses for
  fetching a grabbed FITS file, reused here for the live stream URL instead of a one-shot fetch.
- `<img :src="resolvedStreamUrl">` — the browser's own MJPEG decoder does the rest. No canvas, no
  socket, no manual multipart parsing.
- If the resolved endpoint carries a bearer token (`resolved.endpoint.token`, per
  `2026-08-04-vfs-token-auth.md`): **open question** — an `<img>` tag's `src` can't carry a custom
  `Authorization` header. Options: (a) `fetch()` the stream manually and feed frames to a canvas
  (reintroduces the MJPEG-parsing problem `<img>` was supposed to avoid — undesirable), (b) rely on
  the VFS endpoint accepting the token as a query param if the server supports that, (c) accept that
  token-protected video streams need a `<img>`-compatible auth mechanism decided before this ships.
  Resolve against a real token-protected `IVideo` module before committing to an approach — no such
  module exists in this repo's test fixtures yet (`testing/pyobs-gui-configs/xmpp/video.yaml`, per
  `specs/steering/open-items.md`, is stale — `name:` not yet renamed to `label:`).
- `IExposureTime`/`IGain` controls, shown only when the module implements them (`groupExposure`/
  `groupGain`'s visibility toggle in `videowidget.py`) — same `defaultParamValue`/`ParamForm.vue`
  pattern every other widget already uses for a single-command control.

### FITS Image tab (`VideoGrabView.vue`, new)

- Mirrors `CameraView.vue`'s Phase 2 shape almost exactly: image-type selector (when `IImageType`
  present), count + broadcast checkbox, Grab/Abort buttons, `FitsCanvas` display of the result.
  Reuse `CameraView.vue`'s `expose()`/VFS-resolve/fetch sequence rather than re-deriving it — the
  only difference is the RPC method comes from `IVideo`'s `grab_data` (via `IData`, same signature
  ICamera's own `grab_data` uses) instead of `ICamera`'s.
- No window/binning/gain/image-format settings panel unless a real fixture module needs one — start
  scoped to what `videograbwidget.py` actually has (image type + count + broadcast), matching
  `CameraView.vue`'s own original "scope down to the device-specific core" precedent.

### Registry

Two new `MODULE_WIDGETS` entries in `src/moduleWidgets.ts`, both keyed on `IVideo` (same interface,
two tabs) — `moduleWidgets.ts`'s current `widgetsForModule` (a plain `filter`) already supports two
entries matching the same interface name with no change needed; verify this during implementation
since it's never been exercised with a duplicate-interface pair before.

## Out of scope

- Recording/saving the live stream client-side — not a `pyobs-gui` feature either.
- The socket-level TLS/proxy handling `videowidget.py` does manually — irrelevant once `<img>`
  handles the stream natively; the browser's own HTTP(S) stack covers it.

## Open questions

- Bearer-token auth for the `<img>`-tag stream (see above) — needs a real fixture to resolve against.
- Whether any real `IVideo` module in the fleet also implements `IWindow`/`IBinning` — affects
  whether the FITS Image tab needs a settings panel at all.

## References

- `pyobs-gui/pyobs_gui/videowidget.py`, `videograbwidget.py` — the two widgets this adapts.
- `specs/design/pyobs-gui-widget-parity.md` — registry rows 9-10, the main/sidebar mechanism context.
- `specs/plans/2026-08-03-camera-page.md` — the `CameraView.vue` pattern this reuses (VFS resolve,
  `FitsCanvas`, settings-group shape).
- `specs/plans/2026-08-04-vfs-token-auth.md` — the bearer-token mechanism the open question above
  needs to reconcile with `<img>` streaming.

