# Plan: generic Events page (all event types, not just `LogEvent`)

Status: proposed, not yet implemented. Smallest/cheapest of this batch of
plans — the plumbing already exists, this is purely a new view over data
already being collected.
Repos: pyobs-web-client (all implementation here)

Gap identified by comparing this project's pages against `pyobs-gui`'s
`eventswidget.py` and `pyobs-polaris`'s `EventsView.qml` — both sibling
clients have a page showing every incoming event type across all connected
modules; this client's `LoggingView.vue` only surfaces `LogEvent`.

## What already exists, confirmed by reading the code

`useXmpp.ts`'s PubSub handler (`handleMessage` / the block starting at
`useXmpp.ts:246`) already generically decodes **any** `urn:pyobs:event:`
PubSub node into a `PyobsEvent` (`{type, module, timestamp, uuid, data}`)
and appends it to a single bounded ring buffer, `events` (capped at
`MAX_EVENTS`, exposed read-only from `useXmpp()`). `LoggingView.vue`
(`src/views/LoggingView.vue:12-13,18`) is the only current consumer, and it
filters this same buffer down to `e.type === 'LogEvent'` — every other
event type (`NewImageEvent`, `MotionStatusChangedEvent`,
`FocusFoundEvent`, `ModuleOpenedEvent`, etc.) already lands in `events` and
is simply never shown anywhere today. This plan needs **no new wire
parsing, no new subscription mechanism** — it's a second view over data
already being collected.

## Scope

- New page `EventsView.vue` + always-visible sidebar entry (in the same
  Tools-style section as Logging, per both reference implementations — not
  interface-gated the way Roof/Camera/Telescope/etc. are, since events
  aren't module-type-specific).
- A table/list: Time, Sender (module), Event (type), Data — same four
  columns both reference widgets use. `data` renders as pretty-printed JSON
  (`JSON.stringify(e.data, null, 2)` or similar), matching how `LogEvent`'s
  own fields are presumably already stringified in `LoggingView.vue` today
  — confirm and reuse whatever pattern already exists there rather than
  inventing a second one.
- **Excludes `LogEvent`** — `e.type !== 'LogEvent'`, matching both reference
  widgets' own explicit skip (`LogEvent` stays exclusively on the Logging
  page/footer). Confirmed live by both reference implementations that a
  single module action (e.g. `ITelescope.init()`) produces both a
  `LogEvent` (Logging page only) and a domain event like
  `MotionStatusChangedEvent` (this new page only) at the same moment — a
  good manual-verification case to repeat here.
- **No filtering UI** — `pyobs-polaris`'s own history is directly
  instructive: it shipped filtering first, then removed it on direct
  request, since this page is meant as a flat, unfiltered dump of
  everything, unlike the Logging page (which does filter by module). Skip
  building filtering at all for v1 rather than building then removing it.
- **Mobile**: long event type names must not overflow/overlap the Data
  column — `pyobs-polaris` hit exactly this (a `RowLayout` sibling-overlap
  bug from an unelided long type name) after removing its filter UI freed
  up column width assumptions that turned out wrong; this client's
  equivalent risk is a CSS table/flex layout without `text-overflow:
  ellipsis`/`min-width:0` on the Event-type column — apply the same
  truncation pattern already used elsewhere in this app (Dashboard's
  name/JID truncation) rather than assuming a table naturally handles it.

## Not in scope

- Sending/simulating events (`pyobs-gui`'s `eventswidget.py` has a
  "send event" testing tool alongside its table) — a debugging aid for
  pyobs-gui's own development workflow, not something an operator-facing
  client needs; not proposed here.
- Filtering (see above — deliberately excluded for v1, matching
  `pyobs-polaris`'s own reversal).

## Open questions

- None identified — this is the lowest-risk plan in this batch given the
  underlying data collection already exists and is already tested
  (`events` ring buffer is exercised today via `LoggingView.vue`'s own
  existing tests/manual verification).
