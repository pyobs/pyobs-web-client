# Interface nav sections with per-module routes (Camera, Mode, Roof, ...)

Status: proposed.

## The problem

`AppLayout.vue`'s sidebar currently shows one link per *interface*
(`hasRoofModules = computed(() => modules.value.some((m) => 'IRoof' in m.interfaces))`),
routing to a view (`RoofView.vue`) that lists every online module implementing
that interface stacked on one page. That works for `IRoof`, where multiple
online roof modules will be rare and each one's controls are three buttons
plus a status card.

It breaks down for interfaces where multiple instances are the normal case —
`ICamera`, `IMode`, and others as they get built out. Stacking every camera's
full control panel (exposure settings, live preview, status) on one scrolling
page doesn't scale the way three roof buttons do, and a single collapsed nav
entry gives no way to jump straight to a specific instance — you'd land on
the stacked page and scroll/hunt for the one you want.

## Grounding

Checked `../pyobs-gui/pyobs_gui/mainwindow.py`'s `_client_connected` (line 626)
for the reference sibling client's approach: it does the opposite of the
current web-client pattern — one sidebar entry *per connected module*
(`_add_client(client, icon, widget)`, keyed by client JID in `self._widgets`),
not per interface. Each entry opens that one module's widget directly, no
aggregation view. That gives free single-click access to any instance, but as
a flat, unbounded, reordering-as-modules-connect list — acceptable for a
desktop Qt app's fixed-height page list, worse for this app's mobile sidebar
(`specs/steering/mobile-and-desktop.md`'s standing constraint), where nav
space is scarce and stability matters more.

This design takes the middle position: keep pyobs-gui's one-entry-per-module
click count, but group entries under a per-interface header instead of a flat
list, so structure stays predictable and interfaces with exactly one online
module (the common case for `IRoof`) stay visually compact.

## Design

**Route pattern**: `/cameras/:jid?` (optionally-present param), one route per
multi-instance interface. `:jid` is the module's bare JID (`mod.jid`, e.g.
`camera1@localhost`) — stable, already the key used elsewhere
(`ModuleStateCard`, `executeMethod`), unlike `name` which isn't guaranteed
unique.

- **No `:jid` given** (`/cameras`): redirect to the first online module
  implementing that interface, sorted alphabetically by `name` — same
  ordering `RoofView.vue` already uses (`sort((a, b) => a.name.localeCompare(b.name))`).
  Keeps the single-instance case (today's roof, most future cases) a
  one-click nav hit with no picker step, matching `RoofView`'s current feel.
- **`:jid` given but that module isn't online**: show the view's existing
  "No `<Interface>` modules online"-style empty state (reuses `RoofView`'s
  current empty-state pattern) rather than erroring — covers stale
  bookmarks/links to a module that's since disconnected.
- **Module goes offline while its page is open**: stay on the page, fall
  through to the same empty state live (via the existing reactive `modules`
  list) — no forced navigation away.

**Sidebar (`AppLayout.vue`)**: for each multi-instance interface, compute the
sorted list of online modules implementing it (same `computed` shape as
today's `hasRoofModules`, but the full list, not just `.some(...)`).

- **Exactly one online module**: render one link, same as today's Roof
  entry — no header/indent overhead for the common case.
- **Multiple online modules**: render a small section header (interface
  label, e.g. "Cameras") with one sub-link per module underneath, each
  labeled by `mod.name`, routing to `/cameras/:jid`. Always expanded, no
  accordion/collapse state — keeps interaction to a single click and avoids
  extra state to manage on mobile.
- **Zero online modules**: no entry at all, same as today.
- **Transition between the two**: driven by the same reactive `computed`
  list as everything else here — no separate state. A second module
  connecting mid-session flips a bare link into a header+sublinks
  immediately; dropping back to one does the reverse.

**Interface label**: derived from the interface name, not a hand-maintained
lookup table — strip the leading `I`, then split on capital letters and
join with spaces (`IMode` → "Mode", `IStructuredConfig` → "Structured
Config"). Add an explicit override map only if a future interface name
doesn't split sensibly this way.

**Redirect mechanics**: handled inside the view component, not a
router-level `redirect`. The component already needs a reactive
`computed`/`watchEffect` over the `modules` list for the "module goes
offline, fall through to empty state live" behavior above — an
`onMounted`/`watch` in the same component that calls `router.replace` when
`:jid` is absent reuses that same computed source of truth, instead of
splitting "pick the first module" logic between the router config and the
component and risking them drifting apart.

**View-level change**: `RoofView.vue`'s current "loop over all modules,
render a card per module" body becomes "resolve one module from the route
param (or redirect if absent), render that module's card" — the per-module
card content (status + buttons) is unchanged, just no longer looped. Same
restructuring applies to any future `ICamera`/`IMode` view.

**Mobile**: single-link and header+sublinks cases both reuse existing sidebar
link styling (`sidebar-link` class, existing spacing) — no new layout risk,
same reasoning `roof-page.md` used originally.

## Decided

- **Roof migrates too**: even though multi-`IRoof` will stay rare, moving it
  onto this pattern now keeps one nav mechanism instead of two, and it
  degrades to exactly today's UX (one link, `/roof` redirecting to the sole
  module) whenever there's only one roof online. Included in the same
  implementation pass as this design, not deferred.
- **Redirect-to-first over a picker page**: chosen over showing a picker
  when `:jid` is omitted, to keep the zero-multi-instance case (today's
  reality for Roof, likely common at first for other interfaces too) a
  single click with no intermediate screen.

## Not in scope

- **Building `ICamera`/`IMode` views themselves** — this doc only covers the
  nav/routing pattern they'll land on; their actual control panels are
  separate design work.
- **Collapse/remember-expanded-state for the sidebar sub-links** — always
  expanded, per "Decided" above; revisit only if a real interface ends up
  with enough simultaneous online instances (10+?) to make that unwieldy.
- **Reordering as modules connect/disconnect** — sub-links stay alphabetical
  by `name`; no manual reordering or pinning.
