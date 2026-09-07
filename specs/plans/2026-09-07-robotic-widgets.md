# Plan: Robotic + Scheduler widgets (`IRobotic`, `IRoboticScheduler`)

Status: proposed

Repos: pyobs-web-client (all implementation here)

## Context

Registry rows 16-17 in `specs/design/pyobs-gui-widget-parity.md`. Both are recent additions to
`pyobs-gui`'s own registry (added by its "irobotic-widgets" plan, #825/PR #155, after the
main/sidebar mechanism's own design doc was written) — no web-client equivalent has ever been
scoped. Worth calling out explicitly: of everything in this audit, these two are arguably the
**highest-value** for a mobile client specifically, not a lower priority just because they're last
in the registry table. The other missing widgets (Video, Spectrograph, Config) are about operating
a specific device up close; this pair is "what is my telescope doing right now, and what's it doing
next" — exactly the question someone checks from a phone, not sitting at the console.

Both extend `IStartStop` → `IRunning` (`pyobs-core/pyobs/interfaces/IStartStop.py`) — the same
start/stop/running shape `AutoGuidingView.vue` already implements, not a new interaction pattern.

## `IRobotic` (`RoboticWidget` reference: `pyobs_gui/roboticwidget.py`)

Shows what a `Mastermind`-like executor module is doing right now:

- `RoboticState.current` / `.next` (each a `RoboticTask`: id, name, target, start/end times, obsnum,
  state string, priority) — current task's target/times, next task's target/times +
  `cant_run_reason` (why the *next* task can't start yet, e.g. weather/roof-closed — surfaced by
  `RoboticState.cant_run_reason`, not per-task).
- A live countdown to the next task's start (`_format_countdown` in the reference: `H:MM:SS` until
  start, "overdue" past it) — recomputed on a tick, not just on state push (the reference uses
  `update_func=self._tick`, a periodic UI refresh independent of state pushes, since a countdown
  changes every second with no new state arriving). This app doesn't have a periodic-tick pattern
  today (everything is push-driven) — a `setInterval`-driven `computed`-adjacent ref, cleaned up
  `onUnmounted`, is the natural Vue shape.
- Start/Stop buttons (`IStartStop`), same shape as `AutoGuidingView.vue`'s existing Start/Stop.
- Curated status fields: current task (name/target, formatted start/end via a small time formatter
  — `_format_time`/`_format_countdown` in the reference are the exact display logic to port, not
  reinvent), next task the same, `cant_run_reason` shown only when non-null.

## `IRoboticScheduler` (`ScheduleWidget` reference: `pyobs_gui/schedulewidget.py`)

Shows the upcoming schedule a scheduler module has planned:

- `get_schedule(limit=20)` RPC → list of `RoboticTask` (same dataclass `IRobotic` uses) — a table,
  most-imminent-first, columns roughly: target, start, end, state, priority. On mobile, a table is
  the wrong shape past a few columns — condense to a card-per-task list (target + start/end + state
  as the primary line, matching this app's established mobile pattern from `DashboardView.vue`'s
  compact module cards) rather than porting `tableSchedule`'s literal column layout.
- Poll `get_schedule` on a slower interval than state pushes warrant (`_SCHEDULE_POLL_INTERVAL = 30`
  seconds in the reference, since it can be a live remote HTTP call e.g. to an LCO portal — don't
  poll faster than the reference does, it's a deliberate rate limit on a potentially-expensive call).
- `SchedulerState.last_reschedule` — one curated field, "Last rescheduled: <time>" or similar.
- Start/Stop (`IStartStop`), same shape as above.

## Registry

Two new `MODULE_WIDGETS` entries in `src/moduleWidgets.ts`: `IRobotic` → `RoboticView.vue`,
`IRoboticScheduler` → `ScheduleView.vue`. A module implementing both (plausible — a combined
scheduler+executor) gets two tabs, per the standard multi-match rule; neither is
`sidebar_preferred`.

## Open questions

- No test fixture for either interface exists in `testing/pyobs-gui-configs/xmpp/` — port one from
  `pyobs-gui`'s own `test/*.yaml` (per the established adaptation process in
  `specs/steering/testing-against-live-backend.md`) before implementing, so the countdown/schedule
  list logic has real data to verify against instead of hand-invented fixtures.
- Whether `get_schedule`'s polling should pause when the tab/page isn't visible (this app has no
  existing precedent for visibility-gated polling — check whether it needs one here, or whether 30s
  regardless of visibility is an acceptable cost).

## References

- `pyobs-gui/pyobs_gui/roboticwidget.py`, `schedulewidget.py` — the two widgets this adapts.
- `pyobs-core/pyobs/interfaces/IRobotic.py`, `IRoboticScheduler.py` — `RoboticState`, `RoboticTask`,
  `SchedulerState` wire shapes.
- `specs/design/pyobs-gui-widget-parity.md` — registry rows 16-17.
- `src/views/AutoGuidingView.vue` — the existing `IStartStop`-shaped Start/Stop pattern to reuse.
- `src/views/DashboardView.vue` — the compact per-module card pattern the Scheduler's task list
  should follow instead of a literal desktop table.
