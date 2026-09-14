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
  the Camera page plan (shipped), open question there on how the client
  learns a new image is ready per-grab.
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

Smaller/technical items:

- **`struct<Name>`-typed command params can't be form-built from schema alone**
  — plan at `specs/plans/2026-08-03-struct-typed-command-params.md`, upstream issue
  pyobs-core#898 (2026-09-14, assigned to Tim). Blocked on upstream (pyobs-core doesn't publish
  struct field schemas on the wire). **2026-09-14**: this now genuinely blocks something —
  `BaseTelescope` (parent of `DummyAltAzTelescope`/`DummyRadecTelescope`, already in this repo's own
  test fixtures) implements `track_orbital_elements(elements: OrbitalElements)`. Interim raw-JSON
  fallback (see the plan) not yet implemented.
- **`findRpcFault` reads a richer wire format than it uses** — plan at
  `specs/plans/2026-08-03-rpc-fault-call-id.md`, issues filed pyobs/pyobs-web-client#54 and
  pyobs/pyobs-gui#167 (2026-09-13, both assigned to Tim). Every fault carries a `call_id` (XEP-0009's
  own per-call IQ id) for correlating a caller-side error with the module's origin-side log line —
  confirmed it does reach the systemd journal (`pyobsd`'s `--syslog`, default on) as plain text in
  the log message, and `pyobs-web-admin`'s existing "Filter text…" log search already works on it
  once surfaced, no new work needed there. Not yet implemented on either client.
- **`specs/plans/2026-08-04-vfs-token-auth.md`'s "bump the `testing/.venv` pin" remaining action** —
  still pinned to `2.0.0.dev53`; every fixture verification so far has used an editable install of
  `../pyobs-core` instead as a workaround.

Unchecked risks (no dedicated plan, tracked here so they aren't lost):

- **VFS bearer tokens (`setVfsToken()`) still use a plaintext web fallback on non-native builds** —
  found 2026-09-13 comparing against `pyobs-polaris` (see `specs/design/configuration-file-and-saved-accounts.md`
  there), alongside the same gap for XMPP passwords (fixed, issue #53, closed). Deliberately left
  out of #53's scope (passwords only); no issue filed yet for the token case.
- **Does WebView feel "good enough"?** — still open, waiting on real use via
  `specs/plans/2026-09-06-mobile-first-redesign.md`.
