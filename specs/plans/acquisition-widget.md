# Plan: `IAcquisition` widget

Status: done. See `AcquisitionView.vue`, new `DistanceChart.vue` canvas
component, reused `OffsetScatterChart.vue`. Charts stack vertically (same
choice as `AutoGuidingView.vue`), sidestepping the side-by-side layout risk
flagged below rather than fighting it.
Repos: pyobs-web-client (all implementation here)

Gap identified by comparing this project's pages against `pyobs-gui`'s
`acquisitionwidget.py` and `pyobs-polaris`'s `AcquisitionView.qml` — both
sibling clients have a dedicated widget for `IAcquisition`; this client has
none.

## What `IAcquisition` actually provides

Confirmed directly against `../pyobs-core/pyobs/interfaces/IAcquisition.py`:

```python
async def acquire_target(self) -> AcquisitionResult  # no params at all
# AcquisitionResult(time, ra, dec, alt, az, offset_frame: OffsetFrame | None,
#                    offset_lon, offset_lat)  # lon/lat only if offset_frame is set
# state = AcquisitionState(
#     attempts: list[AcquisitionAttempt{attempt, distance, offset_applied,
#                                        offset_frame, offset_lon, offset_lat}],
#     result: AcquisitionResult | None, time)
```

`IAcquisition(IRunning, IAbortable)` — same `RunningState`/abort pattern as
`IAutoFocus`. **Simpler than `IAutoFocus` in one respect** (confirmed by
`pyobs-polaris`'s own note on this): `acquire_target()` takes no params at
all, so no param-form work beyond a plain button.

`offset_lon`/`offset_lat` are `None` until an offset frame is actually
known (before the first correction) — every consumer of `AcquisitionAttempt`
must handle the null case, not assume both are always present together with
`offset_frame`.

## Scope

- New page `AcquisitionView.vue` + sidebar nav entry, gated on
  `'IAcquisition' in m.interfaces`.
- Per module: "Acquire" button calling `acquire_target()` (no params), "Abort"
  button (`IAbortable`), live `RunningState` via `ModuleStateCard`.
- Result display once `AcquisitionState.result` is set: RA/Dec/Alt/Az (fixed
  decimal formatting, matching `pyobs-gui`'s `%.5f`/`%.3f` precision by
  convention, not a hard requirement) and, if `offset_frame` is set, the
  applied offset labeled "RA/Dec offset" or "Alt/Az offset" depending on
  which frame it is.
- **Two charts, not one** (both hand-rolled `<canvas>`, same "no charting
  library" call as the AutoFocus plan): distance-per-attempt (x = attempt
  number, y = `distance` in arcsec — confirmed `Annotated[float, Unit.ARCSEC]`
  on the wire, so the axis label/unit comes straight from schema) and the 2D
  offset trajectory (x/y = `offset_lon`/`offset_lat`, only for attempts where
  `offset_frame` is set — skip null-offset attempts rather than plotting a
  gap or a zero).
- **Offset trajectory chart specifics**, ported from both reference
  implementations: equal-aspect scaling (so a circular error distribution
  doesn't render visually stretched), an origin crosshair (`offset_lon=0`/
  `offset_lat=0` reference lines), a distinct marker for the first point
  ("start") and the latest point ("latest"). Axis labels depend on
  `offset_frame` (`RA_DEC` → "RA/Dec offset", `ALT_AZ` → "Alt/Az offset").
- **Mobile**: `pyobs-polaris`'s own experience here is a direct, concrete
  warning, not a hypothetical — see "Grounding" below.

## Grounding: pyobs-polaris's layout struggle with these same two charts

`pyobs-polaris/DEVELOPMENT.md`'s "Custom widget: `IAcquisition`" section
documents a long, costly side-by-side-layout bug (two plots meant to sit
side by side, in a Qt/QML `RowLayout`, rendered lopsided — one nearly full
width, the other a sliver — traced through several failed fixes before
landing on sizing each plot from a stable ancestor width rather than the
container's own). That's a QML-specific layout engine issue, not directly
transferable to this project's CSS/flexbox stack, but the **general lesson
transfers directly**: verify the two-charts-side-by-side layout with an
actual live screenshot pass (not just reading the markup) before considering
this done, and stack them vertically as a fallback if flexbox proves
awkward at the widths this page actually needs (matches this project's
existing `specs/steering/mobile-and-desktop.md` bar, which already requires
verifying with a real viewport screenshot regardless).

## Not in scope

- No `FocusFoundEvent`-style event subscription needed — same reasoning as
  the AutoFocus plan: `AcquisitionState.result` already carries the result,
  confirmed neither `acquisitionwidget.py` nor `AcquisitionView.qml` needed
  a separate event for this interface either.

## Open questions

- None identified beyond the layout-verification note above.
