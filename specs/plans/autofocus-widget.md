# Plan: `IAutoFocus` widget

Status: **done**. Implemented as `AutoFocusView.vue`/`FocusCurveChart.vue`,
type-checks, builds, existing unit tests pass, and live-verified against
`pyobs-core`'s `DummyAutoFocus` (`pyobs/modules/focus/dummyautofocus.py`).

Repos: pyobs-web-client (all implementation here)

Gap identified by comparing this project's pages against `pyobs-gui`'s
`autofocuswidget.py` and `pyobs-polaris`'s `AutoFocusView.qml` — both sibling
clients have a dedicated widget for `IAutoFocus`; this client has none (it's
only reachable today via Shell's generic RPC form, with no live-curve
visualization).

## What `IAutoFocus` actually provides

Confirmed directly against `../pyobs-core/pyobs/interfaces/IAutoFocus.py`:

```python
async def auto_focus(self, count: int, step: float, exposure_time: Annotated[float, Unit.SECONDS]) -> AutoFocusResult
# AutoFocusResult(focus: float, focus_err: float)
# state = AutoFocusState(points: list[AutoFocusPoint{focus, value}], time)
```

`IAutoFocus(IRunning, IAbortable)` — so a module also publishes `RunningState`
(from `IRunning`) alongside its own `AutoFocusState`. `auto_focus()` takes
**three required params**, all numeric — the first command in this client
that genuinely needs real (non-null) param values sent, unlike every
existing page's fixed buttons (Roof's `init`/`park`/`stop_motion` all take
no/optional params). Confirmed this isn't a new capability gap for this
client specifically: `ShellView.vue`'s command builder already sends real
typed values from its param forms (`executeMethod`/`valueToXml` handle any
declared type today) — this is only "new" relative to the *other* pages
(`RoofView.vue`), which happened to only ever need null params so far.

## Scope

- New page `AutoFocusView.vue` + sidebar nav entry, gated on
  `'IAutoFocus' in m.interfaces`, same list/card pattern as `RoofView.vue`.
- Per module: three numeric inputs (count, step, exposure_time — the last
  labeled with its `unit` from schema, `pyobs-codec.ts`'s existing
  `FieldSchema.unit` parsing, no new codec work) + a "Run" button calling
  `auto_focus(count, step, exposure_time)`, and an "Abort" button (from
  `IAbortable`, visible/enabled only while running).
- Live status via `RunningState` (`IRunning`, `ModuleStateCard` — reuse as-is)
  and the run's progress via `AutoFocusState.points`, rendered as a
  scatter chart (focus on x, metric value on y) that grows live as points
  arrive during a run.
- On the run's own result: `auto_focus()`'s return value
  (`AutoFocusResult{focus, focus_err}`) is available directly from the RPC
  response — unlike pyobs-gui's `autofocuswidget.py`, which additionally
  listens for a `FocusFoundEvent` (because its `auto_focus()` call and its
  plot-clearing/result-display logic are decoupled across a background
  task). Since this client's RPC call and its own render logic run in the
  same async flow, the RPC's own return value is suffient — **no
  `FocusFoundEvent` subscription needed for v1**, simpler than both
  pyobs-gui and pyobs-polaris (`AutoFocusView.qml` did need the event,
  because its Run button and result display are separated by same the
  qasync-slot-plus-signal indirection pyobs-gui itself uses). Revisit only
  if a real use case needs to see a result triggered by *another* client's
  `auto_focus()` call, not just this page's own.
- **Charting**: hand-roll a minimal `<canvas>`-based scatter/line chart
  component, not a charting library dependency — matches
  `pyobs-polaris`'s own explicit "no external library" decision for its
  equivalent `PlotItem` component (a from-scratch `QQuickPaintedItem`).
  Scope for v1: one scatter series (focus vs. value), a dashed vertical
  line at the fitted result once available, axis labels, gridlines — no
  zoom/pan needed (unlike the Camera page's image display, a focus curve
  is small, fixed-range data).
- **Mobile**: chart canvas needs `max-width:100%` sizing, same constraint
  class as the Camera page's image display — see
  `specs/steering/mobile-and-desktop.md`.

## Not in scope

- `FocusFoundEvent` subscription (see above — the RPC return value already
  covers v1's need).
- Any change to how the chart is drawn beyond the minimal scatter+line
  described above (no legend needed — only one series).

## Open questions

- None identified — this is the most straightforward of the six new
  widgets in this batch, per both reference implementations' own
  experience porting it first.
