# Plan: send event tool

Status: proposed, follow-up to the Events page. Not yet implemented.
Repos: pyobs-web-client (all implementation here)

Split out from `specs/design/events-page.md` once that page shipped — see
that doc's "Outcome" for what's already built (`EventsView.vue`, the
read-only event table this pairs with).

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

## Design

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
  stanza's `from` on decode, confirmed in this client's own event handler —
  though see `specs/steering/testing-against-live-backend.md`'s "Known
  limitation" note: that `from` has been observed as `pubsub.localhost`
  rather than the module's own JID in local testing, which would affect
  this tool's own published events' visible Sender the same way it affects
  the read-only table).
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

## Open questions

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
