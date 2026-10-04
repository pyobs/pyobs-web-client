# Plan: Live view modes (MJPEG with server stretch, raw with client stretch)

Status: planned, issue #58. Not started.

Design lives in pyobs-core: `specs/design/basevideo-live-view.md` (modes, query params, raw meta),
`basevideo-raw-frame-streaming.md` (wire format), `basevideo-http-auth.md` (auth). Server side is
pyobs-core PR #926, released in v2.13.0 (checked against tags 2026-10-04; the issue text and
pyobs-core's design doc still say "not released"). Client code: `src/views/VideoView.vue`.

## Decisions

- Per-camera mode choice, MJPEG default, stored in `localStorage` keyed by module JID, together
  with the stretch/cut settings of both modes. Wrap all reads/writes in try/catch; the view must
  work without storage.
- Raw mode is hidden on Capacitor and phone-sized screens in v1. Phones get MJPEG only.
- Raw rendering starts with Canvas 2D and a typed-array stretch. Keep the stretch function
  isolated so a WebGL path can replace it.
- Raw mode needs CORS on `BaseVideo` (pyobs-core follow-up). See
  `specs/adrs/0002-raw-live-view-needs-basevideo-cors.md`.
- Colour cameras are out of scope: grey rendering plus a short notice. Separate issue later.
- Phased a, b, c. Each phase ships on its own.

## Phase a: MJPEG stretch controls (needs pyobs-core >= 2.13.0 on the cameras)

- [x] Settings composable (`useVideoSettings`; mode field comes with phase b): load/save per JID, defaults, try/catch.
- [x] Controls in `VideoView.vue`: `stretch` (linear/sqrt/asinh/log), `cuts`
      (full/minmax/percentile/manual), `lo`/`hi` (shown for percentile/manual, with the right
      units), `scale`, `quality`. Must lay out on mobile and desktop.
- [x] Build the `/video.mjpg` URL (only non-default params are sent) with these query params; changing a setting reconnects
      (debounce sliders). Keep the existing cookie-login flow.
- [x] Unit tests (`src/__tests__/useVideoSettings.spec.ts`): URL building, validation, storage
      (missing, corrupt, storage throwing).
- [ ] E2E written (`e2e/video-live-view.spec.ts`), NOT yet run against a live BaseVideo: one test against a `BaseVideo` module from pyobs-core `develop`; change a setting,
      assert the stream URL reloads and the image loads. No pixel checks.
- [x] Old servers (no #926) ignore unknown query params (they never read `request.query`), so
      nothing breaks, but the stretch controls then have no effect and the client can't detect
      that. Note it in the UI help text or accept it.

## Phase b: raw mode, full-frame stretch (needs pyobs-core >= 2.14.0 with `cors_origins` set)

- [x] pyobs-core follow-up: opt-in CORS, filed as pyobs/pyobs-core#942, released in v2.14.0 as module option `cors_origins` (`OPTIONS` preflight, allow-origin/headers, credentials
      if needed). File the issue, link it here.
- [x] Read `videoCaps.raw` alongside `mjpeg`; mode toggle only when `raw` is published, the
      screen is desktop-sized and the app is not running under Capacitor (`VideoView.vue`).
- [x] `fetch()` with Bearer token (from `useVfsConfig`), streamed body, abort on unmount and on
      mode/camera change.
- [x] Multipart parser (`src/utils/rawFrameParser.ts`; verified against a live DummyVideo, 640x480 `<u2`): boundary handling across chunk splits, per-part
      `X-Pyobs-Frame-Meta` JSON, little-endian data by `DTYPE`. Read the exact framing in
      `basevideo-raw-frame-streaming.md` and `raw_handler` in `basevideo.py` (checked 2026-10-04).
      Framing: the response declares `boundary=--rawboundary` but the server writes
      `--rawboundary\r\n` as the delimiter, so match what it writes, not the standard. Each
      part is `Content-Type: application/octet-stream`, `X-Pyobs-Frame-Meta: <json>`, blank line,
      data, `\r\n`. No per-part `Content-Length`: derive the byte length from the meta (`NAXIS`,
      `NAXIS1/2`, and `NAXIS3` for 3D frames, times `DTYPE` size). Meta keys: `DTYPE`, `SRCDTYPE`
      (dtype before binning, needed for `full` cuts), `VIDFRAME`, `SETGEN`, `SWBIN`, `DATE-SRC`,
      `DATE-ARR`, `EXPTIME`, `CROP-X`, `CROP-Y`. Binned frames are float32.
- [x] Stretch module (`src/utils/stretch.ts`, LUT for 8/16 bit): linear/sqrt/asinh/log and minmax/percentile/manual/full cuts on typed
      arrays, output to `ImageData` on a canvas. Live controls, no reconnect. Percentiles on a
      subsample, as the server does.
- [x] Reuse `pyobs/utils/stretch.py` semantics so MJPEG and raw look alike for the same settings.
- [x] Unit tests (`rawFrameParser.spec.ts`, `stretch.spec.ts`): parser (split chunks, partial headers, several frames), each stretch/cut
      mode against known values, dtype handling.
- [ ] E2E: raw mode draws a non-blank canvas against a real module.
- [ ] Measure Canvas 2D cost on a 2048x2048 frame (only 640x480 `DummyVideo` frames tried so far). If too slow, plan a WebGL path as a new phase.
- [ ] Check browser connection limits with several cameras on one page (HTTP/1.1 caps about
      6 per host, to be verified); decide whether only the visible camera streams.
- [ ] Check on a real Android device how a streamed cross-origin `fetch()` behaves in the WebView.

## Phase c: zoom with server crop, `bin`, `max_rate`

- [x] Zoom/pan on the canvas (wheel around the cursor, drag, buttons, double-click reset). The
      frame in hand is drawn zoomed (pixelated) at once; the stream then reconnects with a crop of
      the view plus a 25% margin (hysteresis in `needsReconnect`, 250 ms debounce) and sharpens.
- [x] Map displayed pixels back to full-frame coordinates with `CROP-X`, `CROP-Y`, `SWBIN`
      (`src/utils/viewport.ts`); used for pointer anchoring, panning and a cursor readout (x, y,
      value).
- [x] `bin` and `max_rate` options (stored per camera); `max_rate` drops to 1 fps while the tab is
      hidden.
- [x] Unit tests (`viewport.spec.ts`, extended `useVideoSettings.spec.ts`).
- [x] Verified 2026-10-04 in Chromium (Playwright) against a live `DummyVideo`, re-run the same
      day directly against pyobs-core 2.14.0 with `cors_origins: ['*']` (no proxy): stream, live stretch (no request), zoom (`x,y,w,h`
      request), hover readout, bin and `max_rate` params, zoom reset. The scratch page and proxy
      were not committed.
- [ ] E2E (`e2e/video-live-view-raw.spec.ts`, covers b and c): written, NOT run. It skips itself
      when the raw stream can't be opened, so it needs pyobs-core#942 (or a same-origin setup).
- Known limits: cuts are computed on the whole received frame (including the margin), not just the
  visible part; no pinch zoom (raw is hidden on touch phones anyway); `fullSize` is learned from
  the first uncropped frame, so zoom controls are disabled until it arrives.

## Open

- Colour cameras (separate issue). Frames can be 3D (`NAXIS` = 3), so detect that and show the
  grey-only notice instead of mis-rendering.

## Resolved

- Query params: only non-default values are sent; '' means the module's own default.
- `X-Pyobs-Frame-Meta` is a part header inside the multipart body, not a response header, so
  CORS needs no `Access-Control-Expose-Headers` for it.
- #926 is released (v2.13.0), so phase a is unblocked.
