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

## Not in scope for v1

- Sending/simulating events (`pyobs-gui`'s `eventswidget.py` has a
  "send event" testing tool alongside its table) — see "Follow-up: send
  event tool" below for the concrete design; not v1 scope, but no longer
  just "not proposed."
- Filtering (see above — deliberately excluded for v1, matching
  `pyobs-polaris`'s own reversal).

## Open questions

- None identified for the read-only table above — this is the lowest-risk
  plan in this batch given the underlying data collection already exists
  and is already tested (`events` ring buffer is exercised today via
  `LoggingView.vue`'s own existing tests/manual verification). See the
  follow-up's own open question below.

## Follow-up: send event tool

Status: proposed, follow-up to the read-only page above — not v1.

`pyobs-gui`'s `eventswidget.py` pairs its event table with a "send event"
testing tool: pick an event class, fill in a form for its constructor
params, publish it. This client can't copy that approach directly —
`eventswidget.py` enumerates every `Event` subclass via a static Python-side
import of `pyobs.events.__dict__` (pyobs-core's whole module namespace),
which is exactly the kind of hardcoded, globally-enumerated interface
knowledge this client's live-schema-discovery design avoids everywhere else
(see `DEVELOPMENT.md`'s intro — "no build-time codegen — everything is
discovered live from each module's own disco#info response"). There is no
equivalent "list every event type that exists anywhere in pyobs-core" call
on the wire, and there shouldn't need to be one.

**What this client has instead, already parsed and unused**: every
connected module's disco#info response already advertises the event types
*that module* can emit, each with a full field schema — confirmed in
`pyobs-codec.ts:187-192` (`EventSchema { name, version, enums, fields:
FieldSchema[] }`), parsed today into `ModuleInfo.events`
(`useXmpp.ts:131,151`), the same mechanism that already produces
`CommandSchema` for RPC params. Nothing currently reads `mod.events` — it's
sitting there unused. This is narrower than `pyobs-gui`'s global catalog
(only events *some currently-online module* has actually declared, not
every event type pyobs-core ships) but arguably more useful for testing:
you'd only ever want to fake an event realistic for the kind of module
you're pointed at anyway.

### Design

- Module picker (any currently-online module) → event-type picker, sourced
  from that module's own `mod.events` (not a global list).
- Param form built from the chosen event's `fields: FieldSchema[]` — reuse
  Shell's existing RPC-param form builder wholesale, same field types, same
  codec, no new decode/encode work.
- **Wire shape to reconstruct**, confirmed directly against
  `../pyobs-core/pyobs/events/event.py:24-26`: `to_json()` returns exactly
  `{type, timestamp, uuid, data}` — `type` is the class name, `data` is
  whatever the concrete event subclass populates from its own constructor
  args (module/sender is never in the payload — it comes from the XMPP
  stanza's `from` on decode, confirmed in this client's own event handler).
  This client's tool would set `type` to the chosen event name, generate a
  fresh `uuid`/`timestamp` client-side, and build `data` from the filled
  form — no server-side help needed to construct a valid payload.
- **Publish mechanism**: confirmed directly against
  `../pyobs-core/pyobs/comm/xmpp/xmppcomm.py:752-774` — `send_event()` is
  XEP-0163 (PEP) `publish` to node `urn:pyobs:event:{ClassName}:{version}`,
  under **the sender's own JID**, not "as" the module being tested. This
  client would do the same: build a raw
  `<iq type="set"><pubsub><publish node="urn:pyobs:event:Name:version">…`
  stanza by hand (same category of work as the RPC/disco stanzas this
  client already constructs manually via Strophe) and publish it under
  *this client's own* logged-in JID — matching `pyobs-gui`'s own tool
  exactly, which fires under the GUI's own identity too, never impersonates
  the module it's testing against.

### Open questions

- **Does this client see its own published event echoed back into its own
  `events` ring buffer?** Depends on whether a client is subscribed to
  PubSub updates from its own JID by default under this project's existing
  subscription setup — needs live verification against a real server, not
  assumed either way. If not self-delivered, the tool would need to
  optimistically append the fabricated event to the local `events` buffer
  itself immediately on publish (same "assume success, reconcile later"
  shape as everything else in this app that doesn't wait for a round trip)
  rather than relying on the echo.
- Whether this belongs on the Events page itself (a "Send" button/dialog
  alongside the table, matching `pyobs-gui`'s own layout) or as a separate
  Shell-adjacent tool — not decided; leaning toward the Events page itself
  since it's the natural place an operator would already be looking while
  testing.
