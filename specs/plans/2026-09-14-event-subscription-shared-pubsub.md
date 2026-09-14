# Plan: fix event subscription — targets the wrong pubsub host and node id

Status: implemented and live-verified 2026-09-14 against `pyobs-core` 2.8.9
(`testing/.venv`, camera + httpfilecache modules). `grab_sequence(3)`'s three
`NewImageEvent`s all arrived live and rendered in `CameraView.vue` as they
completed; `EventsView.vue` showed the fresh events with today's filenames
instead of the old 2026-07-12 retained item. Issue #56, closed.

Repos: pyobs-web-client (all implementation here)

## Found via

Live-verifying `specs/plans/2026-08-03-idatasequence.md`'s "no new subscription
needed" resolution against `pyobs-core` 2.8.9 (`testing/.venv`, camera +
httpfilecache modules): ran a real `grab_sequence(3)`, confirmed server-side
broadcast of all three `NewImageEvent`s (`pyobs-camera.log`: three
"Broadcasting image ID..." lines), confirmed `httpfilecache` received all
three uploads — but the client never received any of them. `specs/events`
(EventsView.vue) showed only a single stale `NewImageEvent` for `camera`
dated 2026-07-12, unrelated to the test run. That resolution is retracted —
this doc is the fix.

## Root cause

Two separate, unrelated XMPP namespaces got conflated. `urn:pyobs:event:<Name>:<version>`
is a **disco#info feature/capability name** — pyobs-core registers it via
`add_feature()` (`xmppcomm.py:912`, inside `_register_events`) purely to
advertise "this module knows about this event, sends and/or subscribes to
it." It is never a pubsub node id.

The actual pubsub node id, both for publish and subscribe, is
`pyobs:event:<module>:<Name>:<version>` (no `urn:`, module name embedded) —
`XmppComm._event_node()` (`xmppcomm.py:956-958`) — targeted at the **shared
pubsub service** (`pubsub.<domain>`, `self._pubsub_service`), the exact same
service and pattern this client already uses correctly for state
(`pyobs:state:<module>:<Interface>:<version>`, see `stateNode()` /
`subscribeWithRetry()` in `useXmpp.ts:637-680`). `send_event()`
(`xmppcomm.py:860-889`) publishes there; `_subscribe_event_with_retry()`
(`xmppcomm.py:976-1000`) is the reference Python client's own subscribe path,
targeting `self._pubsub_service` with that same node id.

`useXmpp.ts`'s `fetchModuleInfo()` (`src/composables/useXmpp.ts:352-370`)
does neither:

```ts
const node = `urn:pyobs:event:${schema.name}:${schema.version}`   // wrong: this is the disco feature name
sendIQ($iq({ to: bareJid, type: 'set' })                          // wrong: subscribes at the module's own JID (PEP-style), not the shared service
  .c('pubsub', { xmlns: NS_PUBSUB })
  .c('subscribe', { node, jid: myBareJid })
  .tree(),
).catch(() => {})
```

It subscribes to a PEP node hosted on the module's own bare JID, under a node
id that's actually the *disco feature* name. `pyobs-core` never publishes
there, so this subscription is inert. `handlePubsubMessage()`
(`useXmpp.ts:445-461`) also only accepts inbound notifications whose node
starts with `urn:pyobs:event:` — so even a message that did arrive on the
correct `pyobs:event:...` node would be silently dropped by this filter.

What made this look like it half-worked: `fetchCurrentEventItem()`
(`useXmpp.ts:373-`) does a *separate*, explicit IQ-get against the same wrong
`{bareJid, urn:pyobs:event:...}` target on every subscribe, to pre-populate
"the last known value" (comment: "rather than relying on ejabberd's own
resend-on-subscribe push"). Some ejabberd PEP nodes under that legacy id
apparently still hold genuinely old retained items (predating whatever
`pyobs-core` version moved events onto the shared-service model) — explaining
the 2026-07-12 `NewImageEvent` that showed up looking like real data. It is
frozen; it will never update again.

**Blast radius**: `fetchModuleInfo()`'s event subscription is generic, not
`NewImageEvent`-specific — every event in every module goes through it. This
affects `EventsView.vue`, `LoggingView.vue`'s live tail, and now
`IDataSequence`'s per-grab image display. Anything that looked like live
event delivery working was, at best, `fetchCurrentEventItem`'s one-shot old
retained-item fetch, not a live push, for however long this has been broken.

## Fix

All in `src/composables/useXmpp.ts`. `subscribeWithRetry()` (used for state,
`useXmpp.ts:641-680`) is the working reference pattern to mirror — same
service, same retry-then-fetch-current-value shape.

- [x] **Node id.** Change event node construction from
      `` `urn:pyobs:event:${schema.name}:${schema.version}` `` to
      `` `pyobs:event:${moduleUsername}:${schema.name}:${schema.version}` ``,
      where `moduleUsername = Strophe.getNodeFromJid(bareJid) ?? bareJid` —
      exactly the value `stateNode()`'s caller already computes for state,
      confirmed to match `pyobs-core`'s own `Module.name` in practice (both
      derive from the JID username in every tested config).
- [x] **Subscribe target.** Change the subscribe IQ's `to` from `bareJid` to
      `pubsubServiceFor(bareJid)`.
- [x] **`fetchCurrentEventItem`'s target.** Same fix — IQ-get against
      `pubsubServiceFor(bareJid)` with the corrected node, not `bareJid`
      directly.
- [x] **Inbound filter.** `handlePubsubMessage()`: change
      `node.startsWith('urn:pyobs:event:')` to `node.startsWith('pyobs:event:')`
      (no collision with the existing `pyobs:state:` branch above it — differ
      at the 6th character).
- [x] **Module attribution.** `pyobs-core`'s own `_handle_event()` derives the
      publishing module from the node id, not `from` (comment at
      `xmppcomm.py:1051-1053`: "Notifications from the shared pubsub service
      come from that service, not from the publisher"). `handlePubsubMessage()`
      currently sets `ev.module` from
      `Strophe.getNodeFromJid(message.getAttribute('from'))` — that's only
      ever correct by accident (a PEP node's live push carries the real
      publisher's JID; a shared-service node's push does not, live or
      retained). Add a small `eventNodeModule(node)` helper mirroring
      `XmppComm._event_node_module()`'s `parts = node.split(':'); parts[2]`
      shape, and use it instead. This also makes `upsertEvent()`'s
      pubsubHost-vs-real-JID reconciliation (`useXmpp.ts:250-276`, "keeps
      whichever copy has a real module identity") unnecessary — once
      attribution comes from the node id, live and retained pushes resolve
      to the same, always-correct module name, so that dance and its
      accompanying comment can be deleted, not just left dormant.
- [x] **Staleness — decided: scoped to the consumer, not global.** Keeping
      `fetchCurrentEventItem`'s "last known value" model for `EventsView.vue`/
      `LoggingView.vue` (genuinely useful event history for a late joiner),
      rather than adopting `pyobs-core`'s reference-client staleness discard
      globally. `IDataSequence`'s `CameraView.vue` watcher instead tracks its
      own `sequenceStartedAt` (set right before the `grab_sequence()` call)
      and only accepts a `NewImageEvent` timestamped at or after that (5s
      clock-skew slack) — the one consumer where mistaking an old retained
      item for a fresh grab would actually mislead. `upsertEvent`'s uuid
      dedup stays global; timestamp filtering does not.

## Verification

- [x] Re-run this doc's own repro: `grab_sequence(3)` against
      `testing/.venv`'s camera module, confirm each grab's image renders live
      in `CameraView.vue` as it completes (the exact scenario that surfaced
      this). Confirmed 2026-09-14 — all three grabs rendered live; also
      needed a VFS endpoint added for the test account (`root: cache`,
      `http://localhost:37075/`), unrelated to this bug.
- [x] `EventsView.vue`: confirm a live event appears with today's date, not
      just the old retained item. Confirmed — `NewImageEvent` for `camera`
      showed today's filenames during the same test run.
- [ ] `LoggingView.vue`: confirm a fresh `LogEvent` appears live during an
      active session, not only via the resend-on-subscribe replay. Not
      separately exercised — same underlying fix, lower risk, but not
      explicitly re-verified.
- [x] Type-check (`vue-tsc --build`) and full unit suite (`vitest run`,
      146 tests) both pass.
- [ ] Re-check `specs/design/acl-reactive-error-handling.md` and any other
      doc that reasoned about event delivery mechanics while this bug was
      live — their conclusions about *reachability* (does an event arrive at
      all) may be fine (ACL denial doesn't go through the event system), but
      worth a scan.

## Open items this unblocks

- `specs/plans/2026-08-03-idatasequence.md`'s per-grab image display —
  currently shipped with count/delay/progress/abort working but no live
  image rendering, blocked on this fix. Re-verify that plan's "no new
  subscription needed" reasoning once this lands (the reasoning was right;
  only the existing mechanism's correctness was wrongly assumed).

## Not in scope

- Any change to `pyobs-core` itself — this is entirely a client-side
  protocol-conformance bug.
- Auditing every other place `useXmpp.ts` might assume PEP-style,
  module-JID-hosted pubsub — this doc only covers the event-subscription
  path found broken here. Worth a follow-up sweep if this pattern turns out
  to repeat elsewhere, but not asserted here.
