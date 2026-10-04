# Raw live view needs CORS on BaseVideo, not a same-host restriction

status: accepted
date: 2026-10-04

## Context and Problem Statement

Raw live-view mode (issue #58, `specs/plans/2026-10-04-video-live-view-modes.md`) reads
`/video.raw` with a streamed `fetch()`. Unlike the MJPEG `<img>`, a cross-origin `fetch()` is
subject to CORS, and `BaseVideo`'s HTTP server sends no CORS headers and has no `OPTIONS`
handler (`pyobs-core/specs/design/basevideo-http-auth.md`, Open questions: "out of scope here").
Its login cookie is `SameSite=Lax` and `HttpOnly`, so it is also not attached to a cross-site
`fetch()`. The Capacitor Android app has its own origin and is cross-origin to every camera.

## Considered Options

- **Same-origin only.** Raw mode only when the stream is on the app's own origin. No pyobs-core
  change. Rejected: the Android app and nearly every deployment (camera on its own port) would be
  MJPEG-only.
- **CORS support in `BaseVideo`.** Opt-in module option that answers `OPTIONS` preflights and
  sends `Access-Control-Allow-Origin`/`-Headers`, plus `Access-Control-Allow-Credentials` with
  an explicit origin if cookie auth is to work cross-origin. Mirrors what `HttpFileCache`
  already got.
- **Proxy through the web client's host.** Rejected: this client has no server component.

## Decision Outcome

CORS support in `BaseVideo`, as an opt-in module option, tracked as a pyobs-core follow-up to
#926. Raw mode (plan phase b) is gated on it. Phase a (MJPEG) is not.

### Consequences

- Raw mode depends on a second pyobs-core release, after #926. Landed as pyobs/pyobs-core#942,
  released in v2.14.0: module option `cors_origins` (list of origins or `["*"]`; default none),
  preflight answered before auth, `Access-Control-Allow-Origin` on every `/video.raw` response.
  A module needs the option set for raw mode to work from another origin.
- Auth for cross-origin raw: the client sends `Authorization: Bearer <token>`, which forces a
  preflight, so the `OPTIONS` handler is required, not optional. The VFS token is already
  available to the client (`useVfsConfig`).
- Before 2.14.0, or with `cors_origins` unset, raw mode only works for a stream on the app's own origin (same
  scheme, host and port, e.g. behind a reverse proxy). A same-host check is not enough: the same
  host on another port is cross-origin. Verified 2026-10-04 against a running `DummyVideo`
  (pyobs-core 2.13.x): `OPTIONS /video.raw` answers 405 and responses carry no `Access-Control-*`
  headers (checked against 2.13.x). The client offers the toggle whenever a raw path is published and shows an explanatory
  error when `fetch()` fails, instead of guessing from the URL.
- Not verified: how Capacitor's WebView treats a streamed cross-origin `fetch()`. Check on a
  real device in phase b, even though raw mode is hidden on mobile in v1.
