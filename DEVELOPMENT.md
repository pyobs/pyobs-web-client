# Adapting to pyobs-core 2.0

`pyobs-web-client` re-implements the pyobs XMPP wire protocol by hand in
`src/composables/useXmpp.ts` (raw Strophe.js stanzas: disco#info, XEP-0009 RPC,
PubSub). pyobs-core 2.0 changed that protocol in breaking ways — this doc originally
tracked that investigation and implementation live; it's now condensed to current
state plus what's still open. The full research/decision trail (codegen-vs-live-schema,
the pause for upstream changes, bug hunts) is in git history — see the note at the
bottom.

## Status: done

The client speaks pyobs-core 2.0's wire protocol natively, with no build-time
codegen — everything is discovered live from each module's own disco#info response:

- **`src/pyobs-codec.ts`**: generic value↔XML codec for `urn:pyobs:rpc:1` (schema-less
  decode, schema-driven encode) plus parsers for the `<pyobs:interface>`/`<{ns}event>`
  disco#info schema blocks. See the file's own header comments for the wire vocabulary.
- **`src/composables/useXmpp.ts`**: `fetchModuleInfo` parses live interface/event
  schemas and capabilities from one disco#info query per module; `executeMethod` builds
  RPC calls from a module's own fetched command schema; `subscribeState` is a
  ref-counted PubSub state subscription; presence drives module online/offline, with
  `probeRosterPresence()` sending directed presence probes to every roster contact
  right after connecting so already-online modules are discovered even if the server
  doesn't auto-probe on initial presence.
- **`ShellView.vue`**: a pyobs-gui-style console — a log of executed commands/replies
  on top, and a command builder below it that shows only one of module/method/params
  at a time (accordion-style: picking a value collapses that layer into a tappable
  one-line summary and advances to the next). RPC forms are built from live command
  schemas — scalar, `datetime`, and `enum(Name)` (rendered as a populated `<select>`)
  params all work, optional-vs-required defaults are handled correctly, and clicking
  Execute fully resets the builder back to the module picker.
- **`DashboardView.vue`** / **`ModuleStateCard.vue`** / **`KeyValueCard.vue`**: generic
  capability/state rendering, no per-interface hardcoding.
- **`LoggingView.vue`**: live `LogEvent`s via versioned event PubSub nodes.
- No generated files, no local `../pyobs-core` checkout dependency — `generate-interfaces.{py,sh}`
  and `pyobs-interfaces.ts` were deleted along with the npm script.

Tested and verified:

- Unit tests (`npm run test:unit`, Vitest + jsdom) cover the codec: scalar/list/dict/
  dataclass decode, encode round-trip (including int32-vs-float64 disambiguation by
  declared type), schema parsing.
- E2e tests (`npm run test:e2e`, Playwright, `e2e/`) drive the real app against a live
  ejabberd server + real pyobs-core modules — no mocked backend.
- Manually verified live against `admin@localhost` with a real `camera` module: Shell
  RPC calls (success + fault paths, enum dropdowns), Dashboard capability/state cards
  (including nested/list/dict shapes), Logging events, and presence-probe-on-connect
  (roster query returns module accounts, directed probes populate the Dashboard on a
  fresh session).

## Design history and planning

New design docs, implementation plans, and ADRs belong in `specs/` (see
`specs/README.md`) going forward, not inline in this file. This doc's existing
Implemented/Proposed sections below stay as-is (not migrated) — they remain the
record for everything designed before `specs/` existed; the Todo section still
links out to whichever of the two (this file or `specs/`) currently holds a
given item's write-up.

## Standing constraint: every design must work on mobile *and* desktop

Moved to `specs/steering/mobile-and-desktop.md` — applies to all pages/plans,
past and future.

## Implemented: remember previous logins + per-connection config (VFS endpoints)

Moved to `specs/design/login-memory-and-vfs-config.md`. Done, verified live
and via unit tests (`src/__tests__/useVfsConfig.spec.ts`, 44/44 passing).

## Implemented: per-domain WebSocket endpoint config (one install, many servers)

Moved to `specs/design/per-domain-websocket-config.md`. Done, verified live
via a temporary Playwright driver and the existing unit-test setup.

## Implemented: Dashboard — expandable module list instead of a card grid

Moved to `specs/design/dashboard-expandable-list.md`. Done, verified live
against the real ejabberd server at both desktop and 390×844 mobile.

## Implemented: Roof page — status + Open/Close/Stop for `IRoof` modules

Moved to `specs/design/roof-page.md`. Done, verified live against a real
`roof@localhost` module at both desktop and 390×844 mobile.

## Proposed: Camera page — grab & display images from `ICamera` modules

**Superseded by `specs/plans/camera-page.md`** — kept here as historical
record of the original investigation (the FITS-isn't-browser-native research
below is still the grounding for that plan's library choice), not as the
current source of truth for scope/status.

### Scope

- New page (e.g. `CameraView.vue`) + sidebar nav entry, listing every currently-online
  module that implements `ICamera` (= `IData` + `IExposure`, confirmed in
  `../pyobs-core`'s `pyobs/interfaces/ICamera.py`).
- Per module: a minimal expose control — an "Expose" button calling `grab_data()`,
  live `IExposure`'s `ExposureState` (`status`/`progress`/`exposure_time_left`) shown
  while exposing (already have a generic state-rendering pattern via
  `ModuleStateCard`, reusable here), then once `grab_data()` returns a VFS path,
  resolve it via `resolveVfsPath()` and fetch/display the resulting image.
- **Deliberately not** a port of pyobs-gui's full `CameraWidget` (windowing, binning,
  gain, filters, cooling, image format/type, etc.) — every one of those controls is
  just an RPC call or param form, which the existing Shell page already handles
  generically. This page's job is specifically "grab an image and see it," not
  duplicate a full camera control panel.
- **Mobile**: the rendered image must scale to the viewport (`max-width:100%` on the
  canvas/img, not a fixed pixel size) rather than overflowing a narrow screen — the
  module list itself is just button chips + a card per module, same pattern as
  Dashboard/Shell, no special risk there. Panning/zooming a full-resolution image on
  a small screen is a real usability question but not a blocker for a first pass —
  a scaled-to-fit static view is enough to start.

### The hard part: FITS isn't browser-native

Checked `../pyobs-gui/pyobs_gui/datadisplaywidget.py`: it displays grabbed images via
`QFitsWidget`, a real FITS viewer — parses the FITS binary format and applies a
display stretch before rendering, not just a generic image tag. Also checked
`../pyobs-core` for any server-side FITS→PNG/thumbnail conversion (`HttpFileCache`,
"preview", "thumbnail") — **none exists**; `grab_data()`'s returned path is the raw
FITS file, unconverted (and per the example paths already seen elsewhere in this doc,
often gzip-compressed, `.fits.gz`). This means the web client genuinely has to parse
and render FITS itself:

- FITS header parsing (fixed 80-char card records, `NAXIS`/`BITPIX`/etc.) and pixel
  data (typically 16-bit int or 32-bit float).
- A display stretch computed client-side from the decoded pixel array — at minimum
  min/max, ideally zscale (the DS9/`QFitsWidget` convention astronomers expect).
- Rasterizing the stretched array to a `<canvas>`.
- Client-side gzip decompression for `.fits.gz` files, since `fetch()` won't
  transparently decompress a `.gz`-suffixed file unless the HTTP server itself sets
  `Content-Encoding: gzip` — server config this client can't rely on.
- Options: hand-roll a minimal parser (the FITS format itself is simple; zscale is a
  small, well-known algorithm), or evaluate an existing JS FITS library (e.g.
  `fits.js`/`js9`) for bundle-size/license fit — not yet evaluated either way.

This is the single biggest unknown/scope item in the whole proposal — module
listing, the expose button, and VFS path resolution are all straightforward
composition of things already built; FITS decode+render is genuinely new,
nontrivial work and deserves its own investigation before implementation starts.

### Not yet decided

- FITS parsing/rendering approach (hand-rolled vs. library).
- Whether to also subscribe to `NewImageEvent` (mirroring pyobs-gui's event-driven
  auto-refresh) so an image taken by *another* client/script also appears here live,
  versus only showing images this page itself triggered via its own Expose button.

## Proposed: Telescope page — for `ITelescope` modules

**Superseded by `specs/plans/telescope-page.md`** — kept here as historical
record of the original investigation (the `TelescopeWidget` reference research
below is still the grounding for that plan), not as the current source of
truth for scope/status.

### Reference: pyobs-gui's `TelescopeWidget`

Checked `../pyobs-gui/pyobs_gui/telescopewidget.py` (608 lines). It's large: Init/
Park/Stop buttons, a move-to-coordinates form supporting six coordinate systems
(equatorial RA/Dec, horizontal Alt/Az, orbit elements, and three solar/heliographic
systems — HGS, helioprojective radial, helioprojective mu/psi), buttons that resolve
a target *name* into coordinates via external SIMBAD/JPL-Horizons/Horizons lookups, a
small N/S/E/W directional-button offset widget (`compassmovewidget.py` — simpler than
its name suggests, just four buttons, not a click-anywhere compass), and live RA/Dec
+ Alt/Az + offset state. It also folds in `IFilters`/`IFocuser`/`ITemperatures`
sub-widgets, which this client already covers generically via Shell/Dashboard.

### Proposed scope for a first pass

Same "scope down to the device-specific core, leave generic RPCs to Shell" call as
the Camera-page proposal above:

- New page (e.g. `TelescopeView.vue`) + sidebar nav entry, listing every online
  module implementing `ITelescope` (= `IMotion`, confirmed in
  `pyobs/interfaces/ITelescope.py`).
- Per module: Init / Park / Stop buttons + live `MotionState` (status, per-device
  status list) via the existing generic-state pattern (`ModuleStateCard`).
- If the module also implements `IPointingRaDec` and/or `IPointingAltAz`: a
  move-to-coordinates form (RA/Dec and/or Alt/Az number inputs + a Move button
  calling `move_radec`/`move_altaz`) + live `RaDecState`/`AltAzState` position
  display — show whichever the module actually implements, same
  implements-it-or-not pattern the Camera page proposal already uses for optional
  interfaces.
- If the module also implements `IOffsetsRaDec`/`IOffsetsAltAz`: plain numeric
  offset inputs (+ live offset state) — not the N/S/E/W button widget (see below).
- **Mobile**: if a module implements both `IPointingRaDec` and `IPointingAltAz`,
  the two coordinate-move forms must stack vertically on a narrow viewport rather
  than sitting side by side — same `col-sm-*`-stacks-on-phones convention already
  used elsewhere in this app, not a new pattern to invent. Number inputs for
  RA/Dec/Alt/Az/offsets follow Shell's existing stacked label-then-input param
  styling, which is already mobile-sized.

### Deliberately not in scope for a first pass

- **Target-name resolution** (SIMBAD / JPL Horizons / generic Horizons queries) —
  these hit external astronomy services directly from the GUI process; replicating
  that here means either calling the same external APIs from the browser
  (CORS/rate-limit behavior not evaluated) or via some other proxy. A separate
  decision, not assumed as part of this page.
- **Solar/heliographic coordinate systems** (`IPointingHGS`,
  `IPointingHelioprojective`) — niche (solar telescopes only); no module
  implementing either has been seen in this session's live testing. Can be added
  later following the same pattern as RA/Dec and Alt/Az if a real module needs it.
- **Orbit-elements tracking** — not backed by any interface found in
  `pyobs/interfaces/`; `TelescopeWidget`'s orbit-elements handling computes a
  resulting RA/Dec client-side and still calls `move_radec` under the hood. Same
  "not needed until a real module surfaces this" reasoning.
- **The N/S/E/W directional offset widget** — a real, separate small UI component;
  plain numeric offset inputs (the same pattern already used for every other RPC
  param throughout this app) are enough for a first pass.
- `IFilters`/`IFocuser`/`ITemperatures` sub-panels — already generically available
  via Shell (RPC calls) and Dashboard (capability/state cards); not duplicated here.

### Open questions

- Whether Init/Park/Stop deserve dedicated buttons here at all, given Shell can
  already call any `IMotion` RPC generically — leaning yes, since starting/stopping
  a telescope is frequent enough during real operation to deserve one-click access
  without going through Shell's module→method→params flow, but worth confirming
  this small duplication is wanted.
- Whether RA/Dec and Alt/Az sections should render together on one page (whichever
  interfaces a module implements, shown side by side) or as separate tabs/sections
  when a module implements both.

## Todo

Feature proposals queued above (each not yet approved for execution — see its own
section for the full design/reasoning):

- ~~Remember previous logins + per-connection config (VFS endpoints)~~ — **done**,
  see "Implemented: remember previous logins + per-connection config (VFS
  endpoints)" above.
- ~~Per-domain WebSocket endpoint config (one install, many servers)~~ — **done**,
  see "Implemented: per-domain WebSocket endpoint config (one install, many
  servers)" above.
- ~~Dashboard — expandable module list instead of a card grid~~ — **done**, see
  "Implemented: Dashboard — expandable module list instead of a card grid" above.
- ~~Roof page~~ — **done**, see "Implemented: Roof page — status +
  Open/Close/Stop for `IRoof` modules" above.
- ~~Interface nav sections with per-module routes~~ — **done**, design at
  `specs/design/interface-nav-per-module-routes.md`. Replaced the
  one-link-per-interface sidebar/aggregated-page pattern with per-module
  routes (`/roof/:jid?`, migrated Roof onto it) and grouped sidebar
  sub-links; `ICamera`/`IMode` views will land on the same pattern.
- **Camera page** — plan moved to `specs/plans/camera-page.md` (single-shot
  `grab_data()` + fitsjs decode/render; `IDataSequence` and `NewImageEvent`
  deliberately deferred, see that plan and the two below).
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
- **pyobs-core 2.0 ACLs — now implemented upstream** (`0d1c9929`, "Implement access
  control (ACLs) for module RPC calls"; this item previously said "design only,
  nothing implemented yet" — that's stale, corrected here). Re-checked
  `pyobs/modules/module.py` directly rather than trusting the earlier note:
  - **Reactive handling already works, confirmed, no client change needed — but for
    a third, different reason than either previous version of this note claimed.**
    Re-checked again against current `develop` (past `0d1c9929`, up to `ef466ebe`
    / `v2.0.0.dev53`): `ForbiddenError` is now special-cased in
    `pyobs/comm/xmpp/rpc.py:239-241` and sent via
    `self._client.plugin["xep_0009"].forbidden(iq).send()` — a real XMPP IQ-level
    `forbidden` condition, *not* routed through `fault_to_xml` like every other
    exception. So on the wire it is indistinguishable from any other XMPP-level
    IQ error (`item-not-found`, etc.) and is caught by `executeMethod`'s generic
    `try`/`catch` around `sendIQ` (`useXmpp.ts:314-323`, the
    `// XMPP-level error (item-not-found, forbidden, …)` branch) — **not**
    `findRpcFault`. It never reaches `findRpcFault`, so no `errorClass` is set on
    this path; the caller just gets a plain error message. Still zero client
    changes needed for today's UI (the message renders fine either way), but if
    future work ever wants to distinguish "denied by ACL" from other XMPP-level
    errors (e.g. to style it differently, or to cross-check it against
    `get_permitted_methods()`), it has to branch on this catch block, not on
    `errorClass`/`findRpcFault`.
  - **The proactive half is now unblocked** — plan moved to
    `specs/plans/acl-aware-shell-forms.md` (see above).
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
