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
  not in this client — see that doc's "Push notifications" section.
- **iOS build + TestFlight distribution** — not started, blocked on Mac
  access. See `specs/design/native-app-shell-capacitor.md`'s Phasing.

Smaller/technical items:

- **`struct<Name>`-typed command params can't be form-built from schema alone**
  — plan at `specs/plans/2026-08-03-struct-typed-command-params.md`. Blocked on
  upstream (pyobs-core doesn't publish struct field schemas on the wire); not
  blocking anything today, tracked because `IPointingOrbitalElements` (see
  the Telescope page plan) would hit it directly if implemented.
- **pyobs-core 2.0 ACLs — implemented upstream** (`0d1c9929`, "Implement access control (ACLs)
  for module RPC calls"). Reactive handling (what happens when a denied call is actually
  attempted) needs no client change — see `specs/design/acl-reactive-error-handling.md`. The
  proactive half (greying out denied methods before they're tried) is **done** — see
  `specs/plans/2026-08-03-acl-aware-shell-forms.md`.
- **Exception-handling rewrite upstream — no client change needed today, but
  `findRpcFault` is reading a richer wire format than it uses** — plan at
  `specs/plans/2026-08-03-rpc-fault-call-id.md`. Every fault now carries a `call_id`
  (XEP-0009's own per-call IQ id) for correlating a caller-side error with the
  module's origin-side log line; not surfaced on `RpcResult` today because
  nothing consumes it yet.
- **`testing/pyobs-gui-configs/xmpp/*.yaml` fixtures are stale against current `pyobs-core`** —
  `Module.__init__`'s `name` kwarg was renamed to `label` upstream at some point after
  `testing/.venv`'s pinned `2.0.0.dev53`; every fixture still using `name:` fails to start against
  a current `pyobs-core` (confirmed running against an editable install of `../pyobs-core` at
  `2.8.1`, needed to live-verify `specs/plans/2026-08-03-acl-aware-shell-forms.md`). Fixed so far:
  `roof.yaml`, `telescope_acl.yaml`, `telescope_acl_denied.yaml`, `mode.yaml`, `autofocus.yaml`,
  `camera.yaml`, `guiding.yaml`, `acquisition.yaml`; still stale: `full.yaml`, `spectrograph.yaml`,
  `telescope.yaml`, `video.yaml`, `weather.yaml`. Same root cause as, and probably worth doing
  together with, `specs/plans/2026-08-04-vfs-token-auth.md`'s already-tracked "bump the
  `testing/.venv` pin" remaining action.

Unchecked risks (no dedicated plan, tracked here so they aren't lost):

- **Saved-connections data model vs. `pyobs-polaris`** — never compared;
  the offline connections screen shipped without checking that equivalent.
  See `specs/design/native-app-shell-capacitor.md`'s Open questions.
- **Does WebView feel "good enough"?** — still open, waiting on real use via
  `specs/plans/2026-09-06-mobile-first-redesign.md`.
