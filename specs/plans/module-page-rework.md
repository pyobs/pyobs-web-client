# Plan: Module-grouped drill-down (ModulePage rework)

Status: proposed, not yet started — scoping only

Repos: pyobs-web-client (mirrors a model from `../pyobs-gui`, no cross-repo work)

## Context

Today's nav/routing model is interface-first: 7 separate routes, each a standalone view that
independently filters `modules` for ones implementing its interface, resolves the current one from
`route.params.jid`, and redirects to the first available module if none is specified. Confirmed
identical in `RoofView.vue` and `CameraView.vue` — same shape in all 7. `useModuleNavSections.ts`'s
`NAV_INTERFACES` groups nav entries the same way: **by interface**, not by module. A module
implementing two of these interfaces today gets two separate, disconnected nav entries/routes —
not silently dropped like pyobs-gui's pre-fix "first-match-wins" bug, but the same underlying
problem (a module's several interfaces aren't presented as one thing) surfacing differently.

`pyobs-gui` already solved this exact problem — `../pyobs-gui/specs/2026-08-28-gui-main-vs-sidebar-widgets.md`
(issue #150, implemented, `v2.3.0`): one nav entry per module; a module matching several "main
widget" interfaces gets one page with a tab per interface; a shared sidebar (filters, temperatures,
FITS headers — interfaces with no page of their own) stays visible across tabs, not duplicated per
tab. This plan is that model, translated to this app's routing.

On the compact shell specifically, the absence of this shows up as Dashboard cards that only
expand inline (nothing to navigate to) and `MoreView.vue` listing per-interface routes directly.
Both were called out as deliberate, scoped-out gaps while building `specs/plans/mobile-first-redesign.md` —
this doc is the scoping that was deferred.

## Goal

One destination per module. A module implementing several "main widget" interfaces gets one page,
tabbed. A module implementing just one gets that widget directly, no tab chrome. Interfaces with no
dedicated widget stay reachable via `ShellView`, untouched by any of this.

## Not a compact-only change

Worth being explicit, since `mobile-first-redesign.md`'s Non-goals said "no changes to the
wide-screen/desktop layout": grouping nav *by module* instead of *by interface* fixes the same
double-listing problem on desktop too, not just compact. The sidebar's visual chrome doesn't need
to change — still a sidebar — but what it lists does: one entry per module, not one section per
interface. Bigger blast radius than "mobile only" — resolved in "Desktop nav" below: yes, it changes
there too.

## Current shape (confirmed against the code)

- 7 existing main-widget interfaces, each already a standalone view + route: `IRoof`→`RoofView`,
  `IMode`→`ModeView`, `IWeather`→`WeatherView`, `IAutoFocus`→`AutoFocusView`,
  `IAutoGuiding`→`AutoGuidingView`, `IAcquisition`→`AcquisitionView`, `ICamera`→`CameraView`.
  Routes: `/roof/:jid?`, `/mode/:jid?`, `/weather/:jid?`, `/autofocus/:jid?`,
  `/autoguiding/:jid?`, `/acquisition/:jid?`, `/camera/:jid?`.
- Every one of the 7 follows an identical pattern (verified in `RoofView.vue`/`CameraView.vue`): a
  computed filtering `modules` for the interface, `routeJid` from `route.params.jid`,
  `currentModule` lookup, and a `watchEffect` redirecting to the first available module when the
  route has no `:jid` — a one-click nav hit stays one click for the single-instance case.
- `ITelescope` has no view yet (`specs/plans/telescope-page.md`, still proposed) — not built here,
  but the registry/mechanism below should accommodate it landing later without a second rework.
- pyobs-gui's "sidebar" interfaces (`IFilters`, `IFocuser`, `ITemperatures`, `ICooling`) have no
  web-client widgets at all today — the shared-section mechanism should exist, but will likely
  render empty until one of these gets built. Don't skip building the mechanism just because
  nothing populates it yet; retrofitting it once there's a real consumer is the more expensive
  order.

## Decisions to make

### Registry

Extend `useModuleNavSections.ts`'s `NAV_INTERFACES` (today: interfaceName + icon) into interfaceName
+ icon + label + the component to render as that interface's tab — one array, replacing both the
current interface-grouped nav sections and the per-view module-resolution logic duplicated 7 times.

### Routing — resolved: `/module/:jid/:tab?`, a route param, not a query string

Replaces the 7 per-interface routes with one, rendering a `ModulePageView.vue` that resolves the
module once and renders a tab per matching registry entry. A route param rather than `?tab=`
because every existing route in this app already encodes "which specific thing" as a path segment
(`:jid?`) — matching that instead of introducing a second style for the same kind of thing. `:tab`
uses the same mechanical name the registry already produces
(`interfaceName.slice(1).toLowerCase()` — "mode", "roof", "camera"), so
`/module/telescope-1@monet.saao.ac.za/mode` is the Mode tab. No `:tab` → first matching interface
in registry order, mirroring the existing "no `:jid` → redirect to first module" pattern already
in every one of the 7 views. Old routes (`/roof/:jid?` etc.) become redirects to
`/module/:jid/roof` rather than disappearing outright — bookmarks/muscle memory shouldn't just
break.

### Per-widget components

Each of the 7 existing views loses its own module-resolution/redirect logic (moves up into
`ModulePageView.vue`, resolved once regardless of how many tabs a module has) and becomes a
simpler component taking `jid` as a prop. Mechanical, repeated 7 times — the same shape of change
each time, not 7 different problems to solve.

### Tabs vs. no chrome

One matching interface → render that component directly, no visible tab strip (mirrors pyobs-gui's
own revision: the page host always exists, it just doesn't always show tab chrome). Two or
more → a tab strip, most likely reusing the visual language from the `module-page.png` mockup.

### Shared section (the "sidebar" equivalent)

A slot below/around the tabs, visible regardless of which tab is active — the mobile-shell
adaptation of pyobs-gui's shared sidebar column (no room for a persistent side column at phone
width, per the earlier mockup work). Build it now per the note above, even with nothing to put in
it yet.

### Desktop nav — resolved: one entry per module

The desktop sidebar's "Modules" section switches to one-entry-per-module too, matching compact —
not left on its current one-section-per-interface grouping. Both surfaces read from the same
module-grouped registry/routing; only the chrome around it (sidebar vs. bottom-nav shell) differs.

## Out of scope

- `ITelescope` and any other not-yet-built widget — lands later using the same registry; no
  further rework needed if this is scoped right the first time.
- Per-deployment custom widget config (pyobs-gui's `widgets:`/`overwrite:` YAML) — no equivalent
  exists in web-client, not being introduced here.
- Paired sidebar widgets (pyobs-gui's D6, splitting one combined live-view+controls widget) — no
  current consumer in this app.

## Resolved along the way

- **Empty state — one generic message, not 7.** Today each view has its own "No I&lt;Interface&gt;
  modules online" text, because the old model's uncertainty was *which module of this type*. The
  new model resolves one specific module up front (from `:jid`), so the only remaining question —
  "is this module online" — is the same regardless of which interfaces it has. One generic
  "module not online" state at the `ModulePageView` level, shown before any tabs render, replaces
  seven near-duplicate copies of it.

## Open questions

None outstanding — routing, desktop nav, and the empty-state question are all resolved above.
Implementation may still surface real ones (it usually does).

## References

- `../pyobs-gui/specs/2026-08-28-gui-main-vs-sidebar-widgets.md` — the model this mirrors
  (`MainWidgetEntry` registry, `collect_main_widgets`, `ModulePage` container).
- `specs/plans/mobile-first-redesign.md` — where this was deferred from (Phase 2).
- `src/composables/useModuleNavSections.ts`, `src/views/RoofView.vue`, `src/views/CameraView.vue` —
  current interface-grouped nav and the per-view pattern being replaced.
