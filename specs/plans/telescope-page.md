# Plan: Telescope page — for `ITelescope` modules

Status: proposed, not yet implemented — two open questions below unresolved.

Repos: pyobs-web-client (all implementation here)

Supersedes DEVELOPMENT.md's "Proposed: Telescope page" section (kept there as
historical record) — this plan is the current source of truth for scope and
open questions going forward, and additionally folds in non-sidereal tracking
(see below), which postdates that original write-up.

## Reference: pyobs-gui's `TelescopeWidget`

Checked `../pyobs-gui/pyobs_gui/telescopewidget.py` (608 lines). It's large:
Init/Park/Stop buttons, a move-to-coordinates form supporting six coordinate
systems (equatorial RA/Dec, horizontal Alt/Az, orbit elements, and three
solar/heliographic systems — HGS, helioprojective radial, helioprojective
mu/psi), buttons that resolve a target *name* into coordinates via external
SIMBAD/JPL-Horizons/Horizons lookups, a small N/S/E/W directional-button offset
widget (`compassmovewidget.py` — simpler than its name suggests, just four
buttons), and live RA/Dec + Alt/Az + offset state. It also folds in
`IFilters`/`IFocuser`/`ITemperatures` sub-widgets, which this client already
covers generically via Shell/Dashboard.

## Scope for a first pass

Same "scope down to the device-specific core, leave generic RPCs to Shell"
call as the Camera page plan:

- New page `TelescopeView.vue` + sidebar nav entry, listing every online
  module implementing `ITelescope` (= `IMotion`, confirmed in
  `../pyobs-core/pyobs/interfaces/ITelescope.py`), same list/card pattern as
  `RoofView.vue`.
- Per module: Init / Park / Stop buttons + live `MotionState` (status,
  per-device status list) via `ModuleStateCard`, same as `RoofView.vue`'s
  `IMotion` usage.
- If the module also implements `IPointingRaDec` and/or `IPointingAltAz`: a
  move-to-coordinates form (RA/Dec and/or Alt/Az number inputs + a Move button
  calling `move_radec`/`move_altaz`) + live `RaDecState`/`AltAzState` position
  display — show whichever the module actually implements, same
  implements-it-or-not conditional pattern already used for optional
  interfaces elsewhere in this app.
- If the module also implements `IOffsetsRaDec`/`IOffsetsAltAz`: plain numeric
  offset inputs (+ live offset state) — not the N/S/E/W button widget (see
  "Deliberately not in scope" below).
- **Mobile**: if a module implements both `IPointingRaDec` and
  `IPointingAltAz`, the two coordinate-move forms must stack vertically on a
  narrow viewport rather than sitting side by side — same `col-sm-*`-stacks-
  on-phones convention already used elsewhere in this app. Number inputs for
  RA/Dec/Alt/Az/offsets follow Shell's existing stacked label-then-input param
  styling, already mobile-sized.

## Non-sidereal tracking — folded in from the start

Four upstream interfaces landed after the original Telescope page proposal was
first drafted (see `../pyobs-core/docs/source/whatsnew-2.0.rst`, "Non-sidereal
tracking"); this plan folds them in up front rather than risking a second
redesign pass later:

- `ITrackingMode` — discrete, firmware-native rates (`sidereal`/`solar`/
  `lunar`/`off`). If a module implements it: a mode selector (rendered from the
  `enum(TrackingMode)` schema the same way Shell already renders any
  `enum(Name)` param — populated `<select>`, no new codec work) + live
  `TrackingModeState`.
- `ITrackingRate` — a continuous RA/Dec rate offset
  (`Annotated[float, Unit.ARCSEC_PER_SEC]`). If implemented: numeric inputs
  for the RA/Dec rate offset, same pattern as the plain offset inputs above;
  the `unit` attribute is already parsed by `pyobs-codec.ts` (`FieldSchema.unit`,
  `pyobs-codec.ts:175/212`) so the label can show `arcsec/s` without new
  parsing work.
- `IPointingBody` — `track_body(name: str)` (`"moon"`, `"mars"`, an asteroid
  designation, ...). A single text input + "Track" button; the module (not
  this client) resolves the name.
- `IPointingOrbitalElements` — `track_orbital_elements(elements)` for a body
  given as classical orbital elements directly. Struct-typed param — blocked
  on the same `struct<Name>`-can't-be-form-built-from-schema-alone limitation
  as `specs/plans/struct-typed-command-params.md`. **Not buildable as a form
  until that upstream gap closes**; if a real module needs this before then,
  the fallback is a raw-JSON textarea param (bypassing schema-driven form
  generation entirely for this one param) rather than blocking the whole
  interface.
- `DummyRaDecTelescope`/`DummyAltAzTelescope` (`../pyobs-core`) implement all
  four — real modules to test against without hardware; confirm they're still
  present and still implement all four at implementation time, this plan's
  reference is a point-in-time check.

## Deliberately not in scope for a first pass — but see `pyobs-polaris` precedent below

- **Target-name resolution** (SIMBAD / JPL Horizons / generic Horizons
  queries) — these hit external astronomy services directly from the GUI
  process; replicating that here means either calling the same external APIs
  from the browser (CORS/rate-limit behavior not evaluated) or via some other
  proxy. Not core v1 scope, but see "Follow-ups `pyobs-polaris` has already
  proven feasible" below — this is no longer an unevaluated unknown, just
  deferred past v1. (Note: `IPointingBody.track_body(name)` above is
  different — the *module* resolves the name server-side, no client-side
  lookup needed for that path.)
- **Solar/heliographic coordinate systems** (`IPointingHGS`,
  `IPointingHelioprojective`) — niche (solar telescopes only); no module
  implementing either has been seen in live testing so far. Add later
  following the same pattern as RA/Dec and Alt/Az if a real module needs it.
- **The N/S/E/W directional offset widget** — deferred past v1; see the
  compass-widget entry below, which is no longer a hypothetical either.
- `IFilters`/`IFocuser`/`ITemperatures` sub-panels — already generically
  available via Shell (RPC calls) and Dashboard (capability/state cards); not
  duplicated here.

## Follow-ups `pyobs-polaris` has already proven feasible (fast-follows, not v1)

`pyobs-polaris` (a sibling client on this project's exact architecture — see
its own `TelescopeView.qml`) shipped every item this plan lists above as
"deliberately not in scope" as direct follow-ups after its own Telescope MVP
landed. None of this is v1 scope here either, but it's no longer an
unevaluated unknown — concrete implementation paths exist:

- **SIMBAD name resolution**: SIMBAD's TAP (Table Access Protocol) service
  supports a plain-CSV response mode (`FORMAT=csv`) alongside its default
  VOTable/XML, avoiding any XML-parsing dependency — a fixed ADQL query
  (`SELECT ... WHERE ident.id = '<name>'` against `simbad.cds.unistra.fr`,
  single-quote-doubling for literal quotes in the name) resolves both
  catalog designations (`M31`, `NGC 224`) and common names (`Sirius`) via
  the same `ident` table join. **CORS behavior from a browser specifically
  is unverified** — `pyobs-polaris` is a desktop client with no
  same-origin restriction, so this is the one open question a browser
  implementation would need to check before assuming this port is
  straightforward.
- **JPL Horizons ephemeris lookup**: a plain-text HTTP API
  (`ssd.jpl.nasa.gov/api/horizons.api`, `format=text`, `QUANTITIES='1'` for
  astrometric RA/Dec only, `CENTER='500@399'` for geocentric), avoiding
  astroquery's VOTable machinery entirely. The response's actual ephemeris
  row sits between `$$SOE`/`$$EOE` markers; no such block means either an
  unknown name or an ambiguous one (e.g. bare `"Mars"` matches ten
  different bodies including several spacecraft) — both failure modes need
  the same clean "no result found" message, not a crash. Same CORS caveat
  as SIMBAD applies.
- **Sexagesimal RA/Dec parsing** — additive, not a replacement: a bare
  decimal number stays decimal degrees for both RA and Dec (this plan's own
  numeric inputs, unchanged); a genuine multi-component string
  (`"12:00:00"`, colon/space/letter separators, seconds optional) is
  detected by component count and, for RA only, multiplied by 15
  (hours → degrees) — matching the long-standing SIMBAD/DS9 convention.
  Every call site touching a coordinate field (destination preview,
  Move-button enablement, the actual RPC call) must switch to the same
  parser consistently, or some sites silently stay decimal-only while
  others accept sexagesimal — a real bug `pyobs-polaris` specifically
  called out avoiding, not a hypothetical.
- **Compass widget** — a real widget (four N/S/E/W buttons + a step-size
  spinbox), not just "not needed" as this plan currently frames it. Ported
  algorithm: if the module implements `IOffsetsRaDec`, nudge that offset
  directly (`ra/dec += step`, then `set_offsets_radec`); else if it
  implements both `IOffsetsAltAz` and `IPointingAltAz`, convert the
  sky-relative N/S/E/W step into an alt/az-frame offset using the current
  alt/az pointing (needed to know which sky direction "up" currently
  corresponds to in alt/az terms). No exact spherical-offset library
  equivalent needed in this client if unavailable — `pyobs-polaris`
  approximated the alt/az branch via a two-point coordinate-transform
  round trip and accepted it as schema-verified-only, since no `Dummy*`
  module implementing `IOffsetsAltAz` exists to test the exact vs.
  approximate difference against live.
- **Destination-coordinate preview from the module's own observer
  location** — directly relevant to this plan's *core* v1 scope, not just a
  follow-up: `../pyobs-core` 2.0.0.dev18+ added `location: ModuleLocation |
  None` (`longitude`/`latitude` degrees, `elevation` meters, `timezone`) to
  `IModule`'s `ModuleCapabilities`, populated from the module's own config
  and delivered via disco#info capabilities — no new state node, no new
  interface, and (per `pyobs-polaris`'s own confirmation) decodable with
  **zero new wire-parsing code** since this client's existing generic
  capabilities decode already handles arbitrary nested dict/dataclass
  shapes. Per direct instruction on that project (worth following here
  too, absent a reason to differ): **no client-side fallback/editable
  location fields** — a telescope module is expected to always report its
  own location; if `ModuleCapabilities.location` is absent, show a plain
  error ("this telescope module did not report an observer location"), not
  a manual-entry form standing in for it.

## Open questions (unresolved — need a decision before implementation)

- Whether the destination-coordinate preview (using the module's own
  reported `ModuleLocation`, see above) belongs in v1 or is itself a
  fast-follow — it's cheap (no new wire code) but is a genuinely new small
  feature (computing/displaying where a typed RA/Dec or Alt/Az destination
  actually points to before the operator commits to Move), not assumed
  either way here.
- Whether Init/Park/Stop deserve dedicated buttons here at all, given Shell
  can already call any `IMotion` RPC generically — leaning yes, since
  starting/stopping a telescope is frequent enough during real operation to
  deserve one-click access without going through Shell's module→method→params
  flow, but worth confirming this small duplication is wanted.
- Whether RA/Dec and Alt/Az sections (and now `ITrackingMode`/`ITrackingRate`/
  `IPointingBody`) should render together on one page (whichever interfaces a
  module implements, shown side by side) or as separate tabs/sections when a
  module implements more than one.
