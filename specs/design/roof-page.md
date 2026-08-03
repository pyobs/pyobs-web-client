# Roof page — status + Open/Close/Stop for `IRoof` modules

Status: implemented, closed.

## Outcome

**Done, verified live against a real `roof@localhost` module** (this ejabberd
instance grew one during this pass — `IConfig:1`, `IFitsHeaderBefore:1`,
`IModule:1`, `IMotion:1`, `IReady:1`, `IRoof:1`). Built exactly per the design
below, with one grounding detail confirmed live rather than assumed: both
`IMotion` and `IRoof` publish identical `init`/`park`/`stop_motion` commands
(same schema-duplication Shell already disambiguates for interfaces like
`grab_data`), so `RoofView.vue` calls them via the module's `IRoof` interface
schema specifically (semantically matches the page), while the status
`ModuleStateCard` subscribes to `IMotion` (confirmed live: `IRoof` publishes
no `<state>` block of its own — own-only extraction — so `IMotion` is the
only place the state actually appears).

New files/changes: `src/views/RoofView.vue`, plus a `/roof` route
(`router/index.ts`) and a "Roof" sidebar entry (`AppLayout.vue`,
`bi-house-door` icon) under a new "Modules" section (below Tools) reserved
for device-specific pages. Revised after initial implementation, per the
user: the sidebar nav link (and its "Modules" section header) only render
when at least one currently online module implements `IRoof` —
`hasRoofModules = computed(() => modules.value.some((m) => 'IRoof' in m.interfaces))`
in `AppLayout.vue` — since there can be more than one such module (`RoofView`
itself already lists all of them, not just one), this only needs "at least
one," not a specific module's online state. Directly navigating to `/roof`
still works and shows its own "No IRoof modules online" empty state even
when the sidebar link is hidden.

Verified live at both desktop and 390×844 mobile: the real roof module
starts at `status: idle`; clicking **Open** calls `init()` and the status
card updates via live PubSub to `status: initializing` within ~2s (no manual
refresh); clicking **Stop** mid-motion calls `stop_motion()` and the status
returns to `idle`; all three buttons correctly disable while any one action
is in flight for that module; no console errors; layout doesn't overflow on
the narrow viewport. The conditional-nav-link behavior got an unforced
real-world confirmation: partway through this pass the `roof` module
actually went offline in the test environment, and the sidebar correctly
dropped the entire "Modules" section with no code changes needed to
demonstrate it.

## Grounding

Checked `../pyobs-core`'s `pyobs/interfaces/IRoof.py` directly: `IRoof(IMotion)`
adds nothing of its own — no extra methods, no extra state, just a docstring
("The module controls a roof"). All behavior comes from `IMotion` (`init`,
`park`, `stop_motion`, `MotionState { status, devices, time }`) plus `IReady`
above it (`ReadyState`, not used here). Also checked
`../pyobs-gui/pyobs_gui/roofwidget.py` for the reference button mapping,
since "open"/"close" aren't `IMotion` method names on their own: `buttonOpen`
→ `IMotion.init()`, `buttonClose` → `IMotion.park()`, `buttonStop` →
`IMotion.stop_motion()`; status label is `MotionState.status`. (pyobs-gui's
widget also shows a live azimuth via `IPointingAltAz`, if the module
implements it — not part of this page, see "Not in scope".)

## Design

- New page `RoofView.vue` + sidebar nav entry, listing every currently
  online module implementing `IRoof`.
- Per module: a `ModuleStateCard`-style live status readout (reuse the
  existing component/pattern, keyed off the module's own `IMotion` state
  schema — no new state-rendering code needed) plus three buttons —
  **Open**, **Close**, **Stop** — calling `init()`/`park()`/`stop_motion()`
  respectively via the same `executeMethod` path Shell already uses, driven
  by the module's live command schema rather than hardcoded param
  assumptions (there are none here — all three take no required params).
- **Mobile**: same button-chips-plus-card pattern already used throughout
  this app (Dashboard/Shell) — no new layout risk, satisfies
  `specs/steering/mobile-and-desktop.md` by construction rather than needing
  its own verification pass beyond the usual screenshot check.

## Not in scope

- **Azimuth / `IPointingAltAz` display** — pyobs-gui's widget shows this
  when present, but it's an optional bonus on top of a roof, not part of
  `IRoof` itself; already generically available via Dashboard's
  capability/state cards for any module that implements it. Keeps this
  page's job strictly to "roof status + the three motion actions."
- **Per-device stop** — `stop_motion(device: str | None)` accepts an
  optional device name (`MotionState.devices` can list more than one), but
  no real `IRoof` module seen so far exposes more than one device; the Stop
  button calls `stop_motion()` with no argument (stop everything), same as
  pyobs-gui's own `stop_roof()`. Revisit if a multi-device roof module ever
  surfaces.
