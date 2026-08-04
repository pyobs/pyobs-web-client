# Plan: `IAutoGuiding` widget

Status: implemented (`AutoGuidingView.vue`, `OffsetMagnitudeChart.vue`,
`OffsetScatterChart.vue`). Type-checks, builds, and existing unit tests
pass; live-verified against `pyobs.modules.pointing.DummyAutoGuiding`
(`testing/pyobs-gui-configs/xmpp/guiding.yaml`).
Repos: pyobs-web-client (all implementation here)

Gap identified by comparing this project's pages against `pyobs-gui`'s
`autoguidingwidget.py` and `pyobs-polaris`'s `AutoGuidingView.qml` — both
sibling clients have a dedicated widget for `IAutoGuiding`; this client has
none.

## What `IAutoGuiding` actually provides

Confirmed directly against `../pyobs-core/pyobs/interfaces/IAutoGuiding.py`:

```python
class IAutoGuiding(IStartStop, IExposureTime): ...
# state = GuidingState(loop_closed: bool, offset_frame: OffsetFrame | None,
#                       offset_lon, offset_lat, time)
```

`IAutoGuiding(IStartStop, IExposureTime)` — `start()`/`stop()` come from
`IStartStop` (which itself extends `IRunning`, so `RunningState` is what
this page subscribes to for running/idle status — **not** a separate
`IStartStop` state; `pyobs-polaris`'s own note confirms `../pyobs-core`'s
disco#info duplicates an inherited interface's state block under both
names, and the plain base interface, `IRunning`, is the one every other
widget in this app already subscribes to, so this page should follow the
same convention rather than introducing a second path). `set_exposure_time`
comes from `IExposureTime`.

**`GuidingState` has no history — only ever the latest correction.** Unlike
`AcquisitionState.attempts`, there's no server-side log of past corrections;
a "history" chart is a purely client-side accumulation of state pushes as
they arrive, capped at a bounded length (both reference implementations use
50) — confirmed directly from the dataclass shape above, not assumed.

## Scope

- New page `AutoGuidingView.vue` + sidebar nav entry, gated on
  `'IAutoGuiding' in m.interfaces`.
- Per module: Start/Stop buttons (`IStartStop`), live `RunningState` via
  `ModuleStateCard`, and a live-editable exposure-time numeric input
  (`set_exposure_time`) — synced from `ExposureTimeState` the same
  "don't clobber an in-progress edit" way `RoofView.vue`-style pages
  already avoid stomping user input, i.e. only overwrite the input's value
  from a fresh state push if the input currently shows the last value this
  page itself synced from the server.
- **Client-side rolling history** (capped at 50 samples, matching both
  reference widgets): on every `GuidingState` push with a non-null
  `offset_lon`/`offset_lat`, append `(offset_lon, offset_lat)` to a local
  bounded array (a plain reactive `ref<Array<...>>`, `.slice(-50)` on
  append — no new client-side-state pattern needed beyond what Vue's own
  reactivity already provides).
- **Two charts** (same hand-rolled `<canvas>` approach as the AutoFocus/
  Acquisition plans, no charting library): offset-magnitude-vs-sample
  (`sqrt(lon² + lat²)` per history entry) and the lon/lat scatter (same
  equal-aspect/origin-crosshair/latest-marker treatment as the Acquisition
  page's offset trajectory chart — this is genuinely the same chart shape,
  worth sharing one chart component between both pages rather than
  duplicating it).
- Values are in degrees on the wire (`Annotated[float, Unit.DEGREES]`) but
  both reference widgets display them in arcsec (`× 3600`) since that's the
  practically legible unit for guiding-correction magnitudes — port that
  same conversion, labeling axes/values in arcsec explicitly.

## Faithfully-ported quirk, not a bug to fix

Both reference implementations port one specific behavior from the
underlying module rather than "fixing" it: the module keeps re-publishing
the *last known* offset even on an open-loop (lost guide star) push where
nothing new was actually corrected, and both widgets append to history on
any non-null offset regardless of `loop_closed` — meaning the same stale
offset can appear as a duplicate consecutive history entry during an
open-loop stretch. Match this behavior rather than trying to de-duplicate
it, consistent with `pyobs-polaris`'s own explicit choice to verify this is
the real reference behavior (not an assumption) before matching it.

## Not in scope

- No event subscription needed — `GuidingState` alone covers this widget's
  entire live-data need.

## Open questions

- None identified.
