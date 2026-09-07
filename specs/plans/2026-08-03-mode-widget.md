# Plan: `IMode` widget

Status: **done**. Implemented as `ModeView.vue` (see DEVELOPMENT.md's Todo
entry and PR #10).

Repos: pyobs-web-client (all implementation here)

Gap identified by comparing this project's pages against `pyobs-gui`'s
`modewidget.py` and `pyobs-polaris`'s `ModeView.qml` — both sibling clients
have a dedicated widget for `IMode`; this client has none, and unlike
`IFilters`/`IFocuser`/`ITemperatures` (already dismissed elsewhere in this
project's docs as "generically available via Shell/Dashboard"), `IMode`
is **not** actually fully served by the generic path today — see below.

## What `IMode` actually provides

Confirmed directly against `../pyobs-core/pyobs/interfaces/IMode.py`:

```python
async def set_mode(self, mode: str, group: str = "") -> None
# state = ModeState(modes: dict[str, str])          # group -> current mode
# capabilities = ModeCapabilities(modes: dict[str, list[str]])  # group -> available modes
```

**Why this needs a real widget, not just Shell**: `set_mode`'s `mode` and
`group` params are both plain `str` on the wire — not `enum(Name)`, which is
the only param type this client's schema-driven form builder currently
turns into a populated dropdown. A module's actual valid values for `mode`
(and the valid `group` names) only exist in its own `ModeCapabilities`, a
*separate* schema field from the command param itself — Shell's generic
form builder has no mechanism today for cross-referencing one command's
plain-string param against a different capability field's contents, so
today an operator using Shell for `set_mode` gets a bare free-text input
with no validation or discovery of valid values. This is a real, current
gap, not a hypothetical one — confirmed by `pyobs-core`'s own
`group: str` change (was previously `int`, a positional group index) making
free-text entry for `group` genuinely unusable without seeing the
capabilities first.

## Scope

- New page `ModeView.vue` + sidebar nav entry, gated on
  `'IMode' in m.interfaces`.
- Per module: one row per mode "group" from `ModeCapabilities.modes` (a
  `dict[str, list[str]]` — already decodable generically via this client's
  existing dict/list codec support, no new parsing needed) — each row a
  `<select>` populated with that group's own list of valid mode names,
  showing/setting the live current mode from `ModeState.modes[group]`.
- Selecting a new value calls `set_mode(mode, group)` immediately (matches
  both reference widgets — no separate "Apply" step per row).
- **Mobile**: plain stacked `<select>` rows, same pattern as every other
  numeric/enum param input elsewhere in this app — no new layout risk.

## Grounding note: verify `group`'s type against current `pyobs-core` before implementing

`pyobs-polaris/DEVELOPMENT.md`'s own "Custom widget: `IMode`" section
records a real mistake worth learning from directly: an earlier pass
assumed `group` had *already* changed from `int` to `str` upstream, without
re-checking source, and was wrong — the change hadn't landed yet at that
point. The schema shown above (`group: str = ""`) was confirmed directly
against this session's checkout of `../pyobs-core`, but per this project's
own standing practice (grounding claims against current source, not memory
or a secondary description), re-confirm the same file at implementation
time in case it's drifted since this plan was written.

## Not in scope

- Any mode-transition status beyond the current value itself — `ModeState`
  carries no separate "in transition" flag; if a module's mode change has a
  real delay (per `pyobs-polaris`'s note testing against `DummyMode`'s
  3-second transition, which cycles the *separate* `IMotion` `slewing`
  status, not anything in `ModeState` itself), that's whatever generic
  `IMotion` state display already exists for that module elsewhere
  (Dashboard/a device-specific page), not this widget's job to show.

## Open questions

- None identified.
