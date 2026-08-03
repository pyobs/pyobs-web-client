# Dashboard — expandable module list instead of a card grid

Status: implemented, closed.

Current (pre-change) `DashboardView.vue` rendered a responsive grid
(`row g-3`, `col-sm-6 col-lg-4`) of cards, one per module, each **permanently
fully expanded**: interface badges, every `ModuleStateCard` (one per stateful
interface), every `KeyValueCard` (one per capability set), all rendered at
once. Fine for a handful of modules; unmanageable for a real fleet (10–20+
modules, several stateful interfaces each) — the ask was to make this scale,
"like pyobs-gui."

## Outcome

**Done, verified live against the real ejabberd server (`admin@localhost`,
real `camera`/`telescope` modules) at both desktop and 390×844 mobile.** Built
exactly per the design below — no deviations. `DashboardView.vue` now renders
a single-column list of rows sorted by `mod.name`, collapsed by default
(status dot, name, JID, chevron only), with a module's interface
badges/`ModuleStateCard`s/`KeyValueCard`s gated behind
`v-if="expanded.has(mod.jid)"` and revealed by clicking anywhere on the row
header. "Expand all"/"Collapse all" buttons sit next to the heading.
Confirmed live: both modules start collapsed; expanding `camera` alone leaves
`telescope` collapsed and renders its badges/state cards (`ICooling`,
`IExposure`, etc.) with live values; "Collapse all" hides them again; no
console errors; layout wraps correctly on the narrow viewport (name/JID
truncate with `text-truncate`/`min-width:0` rather than overflowing, chevron
pinned via `flex-shrink-0`). Confirms the subscribe-on-expand/
unsubscribe-on-collapse efficiency side note below, since `ModuleStateCard`
mounting/unmounting under the `v-if` is what drives `useXmpp`'s ref-counted
`subscribeState`.

## Reference: pyobs-gui's `StatusWidget`

Checked `../pyobs-gui/pyobs_gui/statuswidget.py` directly. It's a
`QTreeWidget`, one top-level row per module (name, version, live status),
**collapsed by default**. `itemClicked` toggles `setExpanded` — clicking
anywhere on the row, not just its expand arrow (`_toggle_expanded`, explicit
design choice per its own comment). Expanding a row reveals child rows added
lazily in `_add_module_details`: one row listing all interfaces, one row per
interface with capabilities, one row per stateful interface with a
live-updating state label. Rows are kept sorted by module name on insert
(`_insert_module_item`).

## Design

- Replace the card grid with a single-column vertical list of rows, one per
  module, sorted alphabetically by `mod.name` (matches pyobs-gui's
  sort-on-insert).
- A local `expanded: Ref<Set<string>>` (of jids) tracks which rows are open,
  toggled by clicking anywhere on the row header
  (`@click="toggleExpanded(mod.jid)"`) — same "whole row is clickable"
  behavior as pyobs-gui, plus a trailing chevron icon
  (`bi-chevron-down`/`bi-chevron-right`) as the visual affordance.
- **Collapsed row** (default state for every module): status dot, module
  name, JID (muted, smaller), chevron. That's it — matches pyobs-gui's
  collapsed row showing only name/version/status, not the interface list.
- **Expanded row**: reveals, below the header, exactly what the card already
  showed and in the same order — interface badges, `ModuleStateCard`s,
  `KeyValueCard`s — content and components unchanged, just gated behind
  `v-if="expanded.has(mod.jid)"` instead of always rendered.
- **Efficiency side-effect worth calling out**: `ModuleStateCard` already
  subscribes on mount and unsubscribes on unmount (ref-counted in
  `useXmpp`'s `subscribeState`, per its own header comment). Gating it
  behind `v-if` on `expanded` means a collapsed module holds **zero** live
  PubSub subscriptions — the always-expanded design subscribed to every
  stateful interface of every module regardless of whether the user was
  looking at it, which is exactly the kind of cost that compounds as the
  fleet grows. This isn't just visual decluttering; it reduces live
  subscription count proportionally to how many rows are actually open.

## Decided

- **Expand/collapse state is ephemeral** — in-memory only, not persisted
  across a reload, confirmed with the user.
- **Add a "collapse all" / "expand all" affordance**, confirmed with the
  user — trivial once the per-row toggle exists
  (`expanded.value = new Set()` /
  `= new Set(modules.value.map(m => m.jid))`), a small button pair next to
  the "Dashboard" heading.

## Not in scope

- No change proposed to *what* is shown when expanded — this is purely a
  progressive-disclosure/layout change around the existing card content, not
  a redesign of `ModuleStateCard`/`KeyValueCard` themselves.
