# pyobs-fits

Zero-dependency FITS header/image parsing and canvas rendering, for the
browser. No native FITS library dependency (see
`pyobs-web-client`'s `specs/plans/camera-page.md` for why: the available
npm FITS libraries were either Node-only, undocumented, or relied on a
Web Worker + Blob-URL decode path that can't be unit-tested).

Scope is deliberately narrow — a single uncompressed 2D image HDU (what
`pyobs-core`'s `grab_data()` actually returns), not the full FITS standard
(no compressed tiles, data cubes, or binary/ASCII tables). See `src/index.ts`
for the public API.

Currently developed in-tree as an npm workspace package (no build step —
`main`/`exports` point straight at `src/index.ts`) rather than a separate
repo, so its interface can still move freely while it's driven by exactly
one real consumer. Framework-agnostic by design (no Vue/app imports) so it
can be extracted into its own repo/published package later without rework.
