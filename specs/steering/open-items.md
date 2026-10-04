# Open items

Standing snapshot of this repo's not-yet-done work — mirrors the pattern
`pyobs-core/specs/steering/fleet-open-items.md` uses across the fleet, scoped
to this repo alone. Folded in from `DEVELOPMENT.md`'s old "Todo" section
(deleted; see `git log -p -- DEVELOPMENT.md` for that file's own history) —
update this doc in place going forward rather than writing status inline in
plan docs.

Each item not yet approved for execution — see its own linked doc for the
full design/reasoning. Fully-done items already covered by
`specs/design/index.md` (remembered logins + VFS config, per-domain WebSocket
config, the expandable Dashboard, the Roof page, the `IMode`/`IWeather`/
`IAutoFocus`/`IAutoGuiding`/`IAcquisition` widgets, per-module nav routes, the
Camera page, the Telescope page) aren't re-listed here — see that index
instead of this list for the completed-feature catalog.

- **iOS build + TestFlight distribution** — not started, blocked on Mac
  access. See `specs/design/native-app-shell-capacitor.md`'s Phasing.

- **Live view (#58) leftovers** — see `specs/plans/2026-10-04-video-live-view-modes.md`:
  `e2e/video-live-view.spec.ts` and `e2e/video-live-view-raw.spec.ts` written but never run;
  Canvas 2D cost on a 2048x2048 frame unmeasured (640x480 only); browser connection limits with
  several cameras on one page; how the Android WebView treats a streamed cross-origin `fetch()`
  (raw mode is hidden on mobile, so not blocking); colour cameras (raw shows a notice; needs its
  own issue); cuts use the whole received frame, not just the zoomed region.

Unchecked risks (no dedicated plan, tracked here so they aren't lost):

- **Does WebView feel "good enough"?** — still open, waiting on real use via
  `specs/plans/2026-09-06-mobile-first-redesign.md`.
