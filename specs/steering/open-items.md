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
  `specs/design/native-app-shell-capacitor.md`'s Goal 3), but nothing
  server-side triggers a push yet for the events that matter (module
  `ERROR` transitions, bad weather with the roof open, guiding lost,
  `CRITICAL` log events). That logic has to live server-side or in a relay,
  not in this client — see that doc's "Push notifications" section. 2026-09-09:
  scoped as a new pyobs-core module (not XEP-0357/ejabberd), sketch at
  `../pyobs-core/specs/design/push-notification-module.md` — v1 covers module
  `ERROR` only; weather/CRITICAL-log alerts still deferred. The one piece that
  lands in this repo when that module exists: `usePushNotifications.ts` needs
  a small addition to call its device-registration RPC once a token is
  obtained (currently the token only reaches `SettingsView.vue`'s diagnostic
  panel).
- **iOS build + TestFlight distribution** — not started, blocked on Mac
  access. See `specs/design/native-app-shell-capacitor.md`'s Phasing.

Unchecked risks (no dedicated plan, tracked here so they aren't lost):

- **Does WebView feel "good enough"?** — still open, waiting on real use via
  `specs/plans/2026-09-06-mobile-first-redesign.md`.
