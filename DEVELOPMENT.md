# Adapting to pyobs-core 2.0

`pyobs-web-client` re-implements the pyobs XMPP wire protocol by hand in
`src/composables/useXmpp.ts` (raw Strophe.js stanzas: disco#info, XEP-0009 RPC,
PubSub). pyobs-core 2.0 changed that protocol in breaking ways — this doc originally
tracked that investigation and implementation live; it's now condensed to current
state plus what's still open. The full research/decision trail (codegen-vs-live-schema,
the pause for upstream changes, bug hunts) is in git history — see the note at the
bottom.

## Status

The client speaks pyobs-core 2.0's wire protocol natively — implementation and testing detail is
now in `specs/design/pyobs-2-0-wire-protocol-client.md`. Every design doc, implementation plan,
and ADR belongs in `specs/` going forward (see `specs/index.md`); this file's own Todo section
below tracks what's still open, linking out to whichever `specs/` doc holds each item's write-up.
Everything that used to be written inline here — including the original Camera-page and
Telescope-page proposals, both fully superseded by `specs/plans/camera-page.md` and
`specs/plans/telescope-page.md` — is preserved in git history rather than duplicated in both
places; see `git log -p -- DEVELOPMENT.md`.

## Todo

Feature proposals (each not yet approved for execution — see its own linked doc for the full
design/reasoning). Fully-done items already covered by `specs/design/index.md` (remembered logins
+ VFS config, per-domain WebSocket config, the expandable Dashboard, the Roof page) aren't
re-listed here — see that index instead of this list for the completed-feature catalog:

- ~~`IMode` widget~~ — **done**, plan at `specs/plans/mode-widget.md`
  (`ModeView.vue`, #10).
- ~~`IWeather` widget~~ — **implemented**, plan at
  `specs/plans/weather-widget.md` (`WeatherView.vue`, new hand-rolled
  `TimeSeriesChart.vue` canvas component). Type-checks, builds, and existing
  unit tests pass; not yet verified live against a real `MockWeather` module
  — do that before calling this fully done.
- ~~`IAutoFocus` widget~~ — **done**, plan at `specs/plans/autofocus-widget.md`
  (`AutoFocusView.vue`, new hand-rolled `FocusCurveChart.vue` canvas
  scatter-chart component). Type-checks, builds, existing unit tests pass,
  and live-verified against `pyobs.modules.focus.DummyAutoFocus`
  (`testing/pyobs-gui-configs/xmpp/autofocus.yaml`).
- ~~`IAutoGuiding` widget~~ — **done**, plan at
  `specs/plans/autoguiding-widget.md` (`AutoGuidingView.vue`, new
  hand-rolled `OffsetMagnitudeChart.vue`/`OffsetScatterChart.vue` canvas
  chart components). Type-checks, builds, existing unit tests pass, and
  live-verified against `pyobs.modules.pointing.DummyAutoGuiding`
  (`testing/pyobs-gui-configs/xmpp/guiding.yaml`).
- ~~`IAcquisition` widget~~ — **done**, plan at
  `specs/plans/acquisition-widget.md` (`AcquisitionView.vue`, new
  hand-rolled `DistanceChart.vue` canvas component, reusing
  `OffsetScatterChart.vue` from the AutoGuiding widget for the offset
  trajectory). Charts stack vertically rather than side by side, same
  choice `AutoGuidingView.vue` made. Type-checks, builds, and existing unit
  tests pass; live-verified against `pyobs.modules.pointing.DummyAcquisition`
  (`testing/pyobs-gui-configs/xmpp/acquisition.yaml`).
- ~~Interface nav sections with per-module routes~~ — **done**, design at
  `specs/design/interface-nav-per-module-routes.md`. Replaced the
  one-link-per-interface sidebar/aggregated-page pattern with per-module
  routes (`/roof/:jid?`, migrated Roof onto it) and grouped sidebar
  sub-links; `ICamera`/`IMode` views will land on the same pattern.
- ~~**Camera page**~~ — **done**, plan at `specs/plans/camera-page.md` (single-shot
  `grab_data()` + hand-rolled `packages/pyobs-fits` decode/render, see
  `specs/adrs/0001-hand-rolled-fits-decoder-not-npm-library.md`; `IDataSequence` and
  `NewImageEvent` deliberately deferred, see that plan and the two below).
- **Telescope page** — plan moved to `specs/plans/telescope-page.md` (now also
  folds in non-sidereal tracking, see below). Two open questions still
  unresolved there: whether dedicated Init/Park/Stop buttons are worth
  duplicating with Shell, and whether the coordinate-system sections should
  share one page or split into tabs.
- **ACL-aware Shell forms** — plan moved to `specs/plans/acl-aware-shell-forms.md`.
  Unblocked (`IModule.get_permitted_methods()` landed upstream, see the ACL
  entry below), open questions on method-name collision across interfaces and
  log-mode ambiguity still unresolved there.
- **`IDataSequence`** — plan moved to `specs/plans/idatasequence.md`. Depends on
  the Camera page plan shipping first; open question there on how the client
  learns a new image is ready per-grab.
- **Non-sidereal tracking** (`ITrackingMode`/`ITrackingRate`/`IPointingBody`/
  `IPointingOrbitalElements`) — folded directly into
  `specs/plans/telescope-page.md` rather than its own plan, since it's purely
  additive scope on that same page.

Smaller/technical items:

- **`struct<Name>`-typed command params can't be form-built from schema alone**
  — plan moved to `specs/plans/struct-typed-command-params.md`. Blocked on
  upstream (pyobs-core doesn't publish struct field schemas on the wire); not
  blocking anything today, tracked because `IPointingOrbitalElements` above
  would hit it directly if implemented.
- **pyobs-core 2.0 ACLs — implemented upstream** (`0d1c9929`, "Implement access control (ACLs)
  for module RPC calls"). Reactive handling (what happens when a denied call is actually
  attempted) needs no client change — see `specs/design/acl-reactive-error-handling.md`. The
  proactive half (greying out denied methods before they're tried) is unblocked — plan at
  `specs/plans/acl-aware-shell-forms.md`.
- **Exception-handling rewrite upstream — no client change needed today, but
  `findRpcFault` is reading a richer wire format than it uses** — plan moved to
  `specs/plans/rpc-fault-call-id.md`. Every fault now carries a `call_id`
  (XEP-0009's own per-call IQ id) for correlating a caller-side error with the
  module's origin-side log line; not surfaced on `RpcResult` today because
  nothing consumes it yet.

## Full history

The condensed summary above reflects final state; the detailed narrative (why codegen
was dropped, the round where implementation paused pending an upstream pyobs-core
change, the wire-format corrections found while re-verifying against a moving HEAD, the
post-implementation bug hunts) is preserved in git history rather than duplicated here
— see `git log -p -- DEVELOPMENT.md`.
