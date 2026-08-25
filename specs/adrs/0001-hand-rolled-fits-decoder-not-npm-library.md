# Hand-rolled FITS decoder, not an npm library

status: accepted
date: 2026-08-25

## Context and Problem Statement

`CameraView.vue` (`specs/plans/camera-page.md`, Phase 1) needs to decode and rasterize FITS images
client-side — `grab_data()` returns a raw, often gzip-compressed FITS file with no server-side
preview/thumbnail conversion available anywhere in `pyobs-core`. The original plan assumed an
existing JS FITS library rather than a hand-rolled parser; which library (or whether to hand-roll
one) needed a real decision once implementation started.

## Considered Options

- **`fitsjs`** (`astrojs/fitsjs`) — the parsing library JS9 itself is built on, real
  astronomical-FITS track record (compressed images, data cubes, binary/ascii tables) beyond a
  minimal header+pixel-array parser.
- **Full JS9** — rejected before implementation: assumes a JS9-aware backend proxy for loading
  arbitrary URLs, which this client has no server component for and isn't gaining one; its bundled
  toolbar/region-editing UI doesn't fit this app's minimal expose-and-view design.
- **`fits-reader`** (npm) — rejected: Node-only, doesn't run in a browser.
- **`fits-reader-js`** (npm) — rejected: undocumented minified blob, no usable source.
- **Hand-rolled parser** — a new npm-workspace package, `packages/pyobs-fits`.

## Decision Outcome

Hand-rolled parser (`packages/pyobs-fits`) — zero dependencies, framework-agnostic, covers exactly
`grab_data()`'s actual output (single uncompressed 2D image HDU), not the full FITS standard.

`fitsjs` was the leading candidate on paper but rejected once actually tried: untyped, CommonJS-only
(this project is ESM/Vite), and — critically — its real pixel-decode path spins up a Web Worker via
a Blob URL, which can't be unit-tested under jsdom (this project's unit-test environment,
`npm run test:unit`). That last point ruled it out regardless of the typing/CJS issues on their
own — no way to get real unit-test coverage of the decode path with it in place.

### Consequences

- 14 unit tests for `packages/pyobs-fits`, all passing under jsdom — something `fitsjs` would not
  have allowed.
- The package only covers a single uncompressed 2D image HDU, not compressed images, data cubes,
  or binary/ascii tables — sufficient for everything `grab_data()` actually returns today, but a
  real limitation if a future page needs to read a FITS file with a different structure (e.g. a
  multi-extension file from somewhere other than `grab_data()`).
- Client-side gzip decompression (`DecompressionStream('gzip')`) is this project's own
  responsibility rather than a library concern either way — `.fits.gz` handling lives in
  `packages/pyobs-fits/src/gzip.ts`, independent of this decision.
- `specs/plans/camera-page.md`'s "Cross-check against `pyobs-polaris`" section notes that sibling
  client took the opposite path for its own `ICamera` display (`fits::FitsImage` via the
  established C library `cfitsio`, not a hand-rolled parser) — a different, also-reasonable
  answer given C++ has a mature FITS library and the browser doesn't; not evidence for or against
  this decision, just worth knowing the two clients diverged here for good reason on each side.
