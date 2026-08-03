# Events page — generic Events page (all event types, not just `LogEvent`)

Status: implemented, closed.

Gap identified by comparing this project's pages against `pyobs-gui`'s
`eventswidget.py` and `pyobs-polaris`'s `EventsView.qml` — both sibling
clients have a page showing every incoming event type across all connected
modules; this client's `LoggingView.vue` only surfaced `LogEvent`.

## Outcome

**Done, verified live against a real `roof@localhost` module**
(`testing/pyobs-gui-configs/xmpp/roof.yaml`, see
`specs/steering/testing-against-live-backend.md`). Built exactly per the
design below — no new wire parsing or subscription mechanism was needed,
confirming the plan's premise that `useXmpp.ts`'s existing `events` ring
buffer already carried this data unused.

New files/changes: `src/views/EventsView.vue`, a `/events` route
(`router/index.ts`), and an "Events" sidebar entry (`AppLayout.vue`,
`bi-broadcast` icon) in the same always-visible Tools section as Logging —
not interface-gated, matching both reference implementations.

Verified live: ran `IRoof.init` via Shell on a connected `roof` module,
which fires `MotionStatusChangedEvent` (twice: `initializing`, then `idle`)
and `RoofOpenedEvent`; both showed up on the Events page with `LogEvent`
correctly excluded, matching the same action's `LogEvent` output staying
exclusive to the Logging page. Pre-existing retained PubSub items (several
other event types from earlier, unrelated test sessions) also rendered
correctly, giving broader type coverage than the fresh single-module test
alone.

**Real bug found during verification, not fixed here**: the Sender column
shows `pubsub.localhost` instead of the actual module name, for every event
type except `LogEvent`. Root cause and full writeup in
`specs/steering/testing-against-live-backend.md`'s "Known limitation:
event/log 'Sender' column" — it's a pre-existing issue in `useXmpp.ts`'s
module-from-JID derivation (also affects `LoggingView.vue`'s module filter),
not something introduced by this page, and needs a decision (ejabberd config
vs. wire protocol vs. accepted limitation) before it can be fixed.

## Design

- New page `EventsView.vue` + always-visible sidebar entry (in the same
  Tools-style section as Logging, per both reference implementations — not
  interface-gated the way Roof/Camera/Telescope/etc. are, since events
  aren't module-type-specific).
- A table/list: Time, Sender (module), Event (type), Data. `data` renders as
  pretty-printed JSON (`JSON.stringify(e.data, null, 2)`).
- **Excludes `LogEvent`** — `e.type !== 'LogEvent'`, matching both reference
  widgets' own explicit skip (`LogEvent` stays exclusively on the Logging
  page/footer).
- **No filtering UI** — `pyobs-polaris`'s own history is directly
  instructive: it shipped filtering first, then removed it on direct
  request, since this page is meant as a flat, unfiltered dump of
  everything, unlike the Logging page (which does filter by module).
- **Mobile**: `text-truncate`/fixed `table-layout` on the Sender and Event
  columns so long type names can't overflow/overlap the Data column —
  `pyobs-polaris` hit exactly this bug after removing its own filter UI.

## Not in scope

- **Sending/simulating events** — `pyobs-gui`'s `eventswidget.py` pairs its
  event table with a "send event" testing tool. Split out to its own plan:
  `specs/plans/events-page-send-tool.md`.
- **Filtering** — deliberately excluded, matching `pyobs-polaris`'s own
  reversal (see Design above).
