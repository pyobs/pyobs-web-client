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

- **`IDataSequence`** — plan at `specs/plans/2026-08-03-idatasequence.md`. Depends on
  the Camera page plan (shipped). Fully implemented and live-verified 2026-09-14 against
  `pyobs-core` 2.8.9: count/delay/progress/abort, and per-grab image display (needed a
  separate transport fix, `specs/plans/2026-09-14-event-subscription-shared-pubsub.md`,
  issue #56, closed). Two smaller open questions remain from the plan doc: client-side
  sanity bounds on count/delay (currently none — passes through, trusting server-side
  validation), and mobile layout not explicitly verified.
- **Push notification alerting** — client-side spike done end-to-end (see
  `specs/design/native-app-shell-capacitor.md`'s Goal 3); server-side relay
  (`PushNotifier` module, `IPushNotifications` interface) implemented in
  `../pyobs-core` (`5b688528`), landing in core 2.9.0 — v1 covers module
  `ERROR` plus `ERROR`/`CRITICAL` log events; weather/roof-open alerts still
  deferred, see `../pyobs-core/specs/design/push-notification-module.md`.
  2026-09-14: this repo's side done — `usePushNotifications.ts` now watches
  `useXmpp()`'s `modules` for one advertising `IPushNotifications` and calls
  `register_device` once both it and a device token exist (same
  "implements-it-or-not" conditional pattern as `IDataSequence`; no such
  module in the roster → no-op, unit-tested in
  `src/__tests__/usePushNotifications.spec.ts`). **Not live-verified against a
  real device** — this environment has no Android/iOS hardware to obtain a
  real FCM token, the one piece the original spike itself could only verify
  on real hardware too. Worth a real-device check next time this app is
  built and installed.
- **iOS build + TestFlight distribution** — not started, blocked on Mac
  access. See `specs/design/native-app-shell-capacitor.md`'s Phasing.

Unchecked risks (no dedicated plan, tracked here so they aren't lost):

- **Does WebView feel "good enough"?** — still open, waiting on real use via
  `specs/plans/2026-09-06-mobile-first-redesign.md`.
