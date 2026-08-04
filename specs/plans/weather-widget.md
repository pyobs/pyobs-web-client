# Plan: `IWeather` widget

Status: done. Implemented (`WeatherView.vue`, `TimeSeriesChart.vue`) and
verified live against `pyobs.modules.weather.MockWeather`.
Repos: pyobs-web-client (all implementation here)

Gap identified by comparing this project's pages against `pyobs-gui`'s
`weatherwidget.py` and `pyobs-polaris`'s `WeatherView.qml` — both sibling
clients have a dedicated widget for `IWeather`; this client has none (only
generically reachable via Dashboard's `KeyValueCard`, which shows the raw
`readings` list but not per-sensor labels/units laid out as at-a-glance
tiles).

## What `IWeather` actually provides

Confirmed directly against `../pyobs-core/pyobs/interfaces/IWeather.py`:

```python
class IWeather(IStartStop): ...
async def get_sensor_value(self, station: str, sensor: WeatherSensors) -> WeatherSensorReading  # stays RPC
# state = WeatherState(good: bool, readings: list[WeatherSensorReading{sensor, value, unit, time}])
```

**Important correction vs. `pyobs-gui`'s older widget**: `WeatherSensorReading`
has **no per-sensor `good` flag** — only one overall `WeatherState.good`.
`pyobs-gui`'s `weatherwidget.py` (an older reference) colors each tile
red/green individually; `pyobs-polaris`'s newer port correctly dropped that
per-tile coloring in favor of one overall "Weather OK"/"Weather BAD" banner,
since there's no wire data left to color tiles independently. Follow
`pyobs-polaris`'s (correct, more current) version, not `pyobs-gui`'s.

## Scope

- New page `WeatherView.vue` + sidebar nav entry, gated on
  `'IWeather' in m.interfaces`.
- One tile per reading actually present in `state.readings` — not a fixed
  grid of every known `WeatherSensors` member, since a real station only
  reports whichever sensors it actually has (`pyobs-polaris` confirmed live:
  a real module can report as few as its own configured set, not the full
  enum). Each tile: sensor label (a small client-side display-name map,
  e.g. "Temp.", "Rel. humid.", "Dew point" — cosmetic only, not
  schema-derived) + current value + unit (read straight from the reading's
  own wire `unit` field, no second hardcoded unit map).
- One overall "Weather OK" / "Weather BAD" banner, colored from
  `state.good` — not per-tile coloring (see correction above).
- **History plot: include it, since it's cheap here.** Unlike the C++/QML
  reference (where `pyobs-polaris` deliberately simplified away from
  `weatherwidget.py`'s per-sensor history plot, likely for its own
  plotting-cost reasons, not stated as a wire limitation), this client's
  hand-rolled `<canvas>` chart component (same one built for the
  AutoFocus/Acquisition/AutoGuiding plans) makes a per-sensor time-series
  cheap to add: on each `WeatherState` push, append each reading's
  `(time, value)` into a bounded per-sensor history array (capped, e.g.
  200 samples, matching `pyobs-gui`'s own `_HISTORY_LENGTH`), one small
  stacked chart per sensor that has history, x-axis time-formatted.
- **Mobile**: tiles as a wrapping flex row (not a fixed grid), same
  wrap-on-narrow-viewport pattern as chip-based rows elsewhere in this app;
  stacked history charts scale to `max-width:100%` same as every other
  chart in this batch of plans.

## Testing without a real weather module

`pyobs-polaris`'s own experience is directly useful here: no `Dummy*` module
implemented `IWeather` (the only real implementation is an HTTP client to a
separate `pyobs-weather` service) until the user added
`pyobs.modules.weather.MockWeather` to `../pyobs-core` — a genuinely
self-contained simulated station with fixed default readings, usable as a
live test target the same way `DummyRoof`/`DummyCamera`/etc. already are for
other pages. Confirm `MockWeather` is still present at implementation time
(check `../pyobs-core/pyobs/modules/weather/mockweather.py`) and use it for
manual verification rather than only unit-testing in isolation.

## Not in scope

- `get_sensor_value(station, sensor)` — stays a real RPC call per its own
  interface contract (a live per-station query, not part of the pushed
  `WeatherState`), already generically callable via Shell; not duplicated
  on this page.
- Start/Stop (`IStartStop`) controls for the weather module itself — this
  page is read-only display, matching both reference widgets' own scope
  (neither exposes Start/Stop from their weather widget either).

## Open questions

- None identified.
