# Raw live view needs CORS on BaseVideo, not a same-host restriction

status: proposed
date: 2026-10-04

## Context and Problem Statement

Raw live-view mode (issue #58, `specs/plans/2026-10-04-video-live-view-modes.md`) reads
`/video.raw` with a streamed `fetch()`. Unlike the MJPEG `<img>`, a cross-origin `fetch()` is
subject to CORS, and `BaseVideo`'s HTTP server sends no CORS headers and has no `OPTIONS`
handler (`pyobs-core/specs/design/basevideo-http-auth.md`, Open questions: "out of scope here").
Its login cookie is `SameSite=Lax` and `HttpOnly`, so it is also not attached to a cross-site
`fetch()`. The Capacitor Android app has its own origin and is cross-origin to every camera.

## Considered Options

- **Same-host only.** Raw mode only when the stream URL has the app's own hostname (the same
  rule `VideoView.vue` already uses for the token login). No pyobs-core change. Rejected: the
  Android app and any deployment where the client is served from a different host would be
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

- Raw mode depends on a second pyobs-core release, after #926.
- Auth for cross-origin raw: the client sends `Authorization: Bearer <token>`, which forces a
  preflight, so the `OPTIONS` handler is required, not optional. The VFS token is already
  available to the client (`useVfsConfig`).
- Until the follow-up lands, raw mode may be offered only for same-host streams, via the
  existing `isSameHost` check. This is a temporary gate, not the decision.
- Not verified: how Capacitor's WebView treats a streamed cross-origin `fetch()`. Check on a
  real device in phase b, even though raw mode is hidden on mobile in v1.
