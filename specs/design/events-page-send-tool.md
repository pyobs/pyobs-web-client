# Send event tool

Status: implemented, closed.

Follow-up to `specs/design/events-page.md`'s read-only Events page — see that
doc's "Outcome" for what it's paired with.

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
on the wire, and there shouldn't need to be one — every connected module's
disco#info response already advertises the event types *that module* is
involved with, each with a full field schema (`EventSchema`, parsed into
`ModuleInfo.events`), same mechanism as `CommandSchema` for RPC params.

## Outcome

**Done, verified live against `roof`/`mode`/`camera`/`weather`/etc. modules**
(`testing/pyobs-gui-configs/xmpp/full.yaml` plus a standalone
`weather.yaml` fixture). Went through two real design corrections before
landing — both caught by direct user pushback while dogfeeding the first
cut, not anticipated up front:

**Correction 1 — flattened the picker, dropped the module-first step.** The
first version was module picker → event picker, scoped to that module's own
declared events (mirroring Shell's command builder). That's backwards for
this tool's actual use: you're testing what happens when an event fires —
e.g. sending `BadWeatherEvent` to see whether `roof`/`telescope` react
safely — and the module you'd pick to watch react is usually *not* a source
of the event, so a module-first picker forces you to already know which
module (if any) actually emits it. Fixed by flattening to a single
event-type picker across the union of every currently-online module's own
declared events, keyed by `${name}:${version}` and deduped across modules
that all declare the same event.

**Correction 2 — needed `pyobs-core`'s event-role-advertising fix.**
Flattening alone wasn't enough: disco#info conflated "module emits this"
with "module only subscribes to react to this" into one undifferentiated
list, so e.g. `camera` (which only *reacts* to `BadWeatherEvent` to abort an
exposure, never emits it) was indistinguishable from a real weather source.
This blocked the tool from ever telling you "nothing currently online
actually sends this" — you'd pick `BadWeatherEvent`, get a schema, and have
no idea whether you were about to test a real scenario or send into a void.
Fixed upstream in `pyobs-core` (`../pyobs-core/specs/plans/event-role-advertising.md`,
commit `d3f78f72`): `<event>` elements now carry a `role="send"` /
`role="subscribe"` / `role="send subscribe"` attribute, parsed into
`EventSchema.role` (`pyobs-codec.ts`). Confirmed live over the wire: with
every weather-emitting module offline, `camera`'s disco#info still showed
`<event ... name='BadWeatherEvent' role='subscribe'/>` — never `role='send'`
from anyone. The event picker surfaces this via each button's hover text
("Sent by: nobody currently online — Reacted to by: camera") rather than a
separate visual warning — a plain hint you can check, not an alarm, since
sending a synthetic event to test a subscriber is a legitimate, common case
here, not a mistake to flag. The same `role` fix also let
`fetchModuleInfo` stop PubSub-subscribing to subscribe-only event nodes a
module never actually publishes on — a second, independent bug the
undifferentiated list caused.

New files/changes: a "Send event" panel in `EventsView.vue` (event-type
picker, role-labeled and role-styled → param form → Send), `publishEvent()`
in `useXmpp.ts`, `EventSchema.role` parsing in `pyobs-codec.ts`, and a
shared `ParamForm.vue` component + a handful of pure helpers moved from
`ShellView.vue` into `pyobs-codec.ts` (`unwrapOptional`, `widgetKind`,
`enumOptions`, `formatWireType`, `hasUnsupportedField`, `defaultParamValue`,
`paramValueFromString`) — Shell was refactored to use the same shared code
rather than duplicating it for this new panel, per the original plan's
"reuse Shell's existing RPC-param form builder wholesale."

**Open question resolved — no self-echo observed**: captured raw WebSocket
frames across several live publish attempts. The only `<message>` echoes
seen for a freshly-published node arrived at (re)connect/subscribe time,
replaying a *previous* test run's retained item (identical `uuid`/
`timestamp` to an earlier publish) — never a fresh push triggered by the
current publish itself. Concretely: clicking Send left the events table's
row count unaffected until the fallback below was added; before that,
waiting up to 3s post-publish produced no new row. So `publishEvent()`
appends the fabricated event to the local `events` ring buffer
optimistically, immediately after a successful publish IQ — exactly the
original plan's proposed fallback, confirmed necessary rather than
speculative. The appended entry's `module` is derived from the logged-in
JID's own username (e.g. `admin`), matching real wire semantics (published
under the sender's own identity, never impersonating the module whose
schema supplied the event type).

**Also confirmed live**: fields with unsupported wire types (e.g.
`MotionStatusChangedEvent.interfaces`, `optional<any>` — pyobs-core doesn't
publish enough schema for a dict/struct field) correctly disable the Send
button with the same "unsupported param type" messaging Shell already uses
for RPC params — shared behavior via `hasUnsupportedField`, not a new gap
introduced by this tool.

## Design

- Event-type picker: the union of every currently-online module's own
  declared events, deduped by `${name}:${version}`, each entry tracking
  which module names sent it (`role` includes `send`) versus which only
  subscribe (`role` includes `subscribe`) — an event with zero senders is
  visually flagged (warning-styled button + inline note) rather than picked
  silently.
- Param form built from the chosen event's `fields: FieldSchema[]`, via the
  shared `ParamForm.vue` component (also used by Shell).
- **Wire shape**, confirmed against `../pyobs-core/pyobs/events/event.py:24-26`:
  `to_json()` returns exactly `{type, timestamp, uuid, data}` — `type` is the
  class name, `data` is whatever the concrete event subclass populates from
  its own constructor args. `publishEvent()` sets `type` to the chosen event
  name, generates a fresh `uuid`/`timestamp` client-side, and builds `data`
  from the filled form via `paramValueFromString` per field (plain JSON, not
  XML-wrapped like RPC params — confirmed against a live wire capture, see
  `specs/steering/testing-against-live-backend.md`).
- **Publish mechanism**, confirmed against
  `../pyobs-core/pyobs/comm/xmpp/xmppcomm.py:752-774`: `send_event()` is
  XEP-0163 (PEP) `publish` to node `urn:pyobs:event:{ClassName}:{version}`,
  under the sender's own JID. `publishEvent()` does the same: a raw
  `<iq type="set"><pubsub><publish node="urn:pyobs:event:Name:version">…`
  stanza built by hand (same category of work as the RPC/disco stanzas this
  client already constructs manually via Strophe), self-published (no `to`
  attribute) under the logged-in user's own JID — never impersonating the
  module whose schema supplied the event type, matching `pyobs-gui`'s own
  tool exactly.
- Lives on the Events page itself (a collapsible "Send event" panel above
  the table), not a separate Shell-adjacent tool — the natural place an
  operator would already be looking while testing, and where `pyobs-gui`'s
  own equivalent lives too.

## Explicitly not solved

**An event nothing currently online either sends or subscribes to is still
unreachable** — e.g. a fresh install with zero weather-aware modules
running has no way to synthesize `BadWeatherEvent` at all, role attribute or
not, since there's nothing left to source a schema from. A raw
name/version/JSON manual-entry escape hatch was prototyped for this and
explicitly rejected: it would let you send *something*, but with zero
validation and no connection to a real schema, which undercuts the one
guarantee this tool otherwise has (every send matches some real module's
real schema). The accepted answer for now is operational, not code: spin up
the relevant module (`testing/pyobs-gui-configs/xmpp/weather.yaml` for
weather events) for the duration of the test.
