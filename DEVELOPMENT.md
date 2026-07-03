# Adapting to pyobs-core 2.0

`pyobs-web-client` re-implements the pyobs XMPP wire protocol by hand in
`src/composables/useXmpp.ts` (raw Strophe.js stanzas: disco#info, XEP-0009 RPC,
PubSub). pyobs-core 2.0 changed that protocol in breaking ways — this doc originally
tracked that investigation and implementation live; it's now condensed to current
state plus what's still open. The full research/decision trail (codegen-vs-live-schema,
the pause for upstream changes, bug hunts) is in git history — see the note at the
bottom.

## Status: done

The client speaks pyobs-core 2.0's wire protocol natively, with no build-time
codegen — everything is discovered live from each module's own disco#info response:

- **`src/pyobs-codec.ts`**: generic value↔XML codec for `urn:pyobs:rpc:1` (schema-less
  decode, schema-driven encode) plus parsers for the `<pyobs:interface>`/`<{ns}event>`
  disco#info schema blocks. See the file's own header comments for the wire vocabulary.
- **`src/composables/useXmpp.ts`**: `fetchModuleInfo` parses live interface/event
  schemas and capabilities from one disco#info query per module; `executeMethod` builds
  RPC calls from a module's own fetched command schema; `subscribeState` is a
  ref-counted PubSub state subscription; presence drives module online/offline, with
  `probeRosterPresence()` sending directed presence probes to every roster contact
  right after connecting so already-online modules are discovered even if the server
  doesn't auto-probe on initial presence.
- **`ShellView.vue`**: a pyobs-gui-style console — a log of executed commands/replies
  on top, and a command builder below it that shows only one of module/method/params
  at a time (accordion-style: picking a value collapses that layer into a tappable
  one-line summary and advances to the next). RPC forms are built from live command
  schemas — scalar, `datetime`, and `enum(Name)` (rendered as a populated `<select>`)
  params all work, optional-vs-required defaults are handled correctly, and clicking
  Execute fully resets the builder back to the module picker.
- **`DashboardView.vue`** / **`ModuleStateCard.vue`** / **`KeyValueCard.vue`**: generic
  capability/state rendering, no per-interface hardcoding.
- **`LoggingView.vue`**: live `LogEvent`s via versioned event PubSub nodes.
- No generated files, no local `../pyobs-core` checkout dependency — `generate-interfaces.{py,sh}`
  and `pyobs-interfaces.ts` were deleted along with the npm script.

Tested and verified:

- Unit tests (`npm run test:unit`, Vitest + jsdom) cover the codec: scalar/list/dict/
  dataclass decode, encode round-trip (including int32-vs-float64 disambiguation by
  declared type), schema parsing.
- E2e tests (`npm run test:e2e`, Playwright, `e2e/`) drive the real app against a live
  ejabberd server + real pyobs-core modules — no mocked backend.
- Manually verified live against `admin@localhost` with a real `camera` module: Shell
  RPC calls (success + fault paths, enum dropdowns), Dashboard capability/state cards
  (including nested/list/dict shapes), Logging events, and presence-probe-on-connect
  (roster query returns module accounts, directed probes populate the Dashboard on a
  fresh session).

## Open items

- **`struct<Name>`-typed command params can't be form-built from schema alone.**
  Unlike `enum(Name)`, whose values live in disco#info's `<types>` block, a
  `struct<Name>` param/field only ever gives you the struct's *name* — pyobs-core
  doesn't publish its field list anywhere on the wire. Not an issue today (no real
  command takes a struct/list/dict param), but if one appears, pyobs-core would need
  to publish struct field schemas too before the client could build an input widget
  for it.
- **pyobs-core 2.0 ACLs** — design only on the pyobs-core side so far, nothing
  implemented yet (see its own `DEVELOPMENT.md`,
  [Access Control (ACLs)](https://github.com/pyobs/pyobs-core/blob/develop/DEVELOPMENT.md#access-control-acls)).
  Reactive handling needs no change here: `executeMethod` (`useXmpp.ts:286-295`)
  already catches any XMPP IQ-level error generically — its own existing comment
  reads `// XMPP-level error (item-not-found, forbidden, …)` — and returns it as a
  plain error result, which already covers the `forbidden` condition this design
  routes ACL denials through. Still open, blocked on `IModule.get_permitted_methods()`
  landing in pyobs-core first (its Phase 8): once it exists, `ShellView.vue`'s RPC
  forms — already built per-module from the live command schema `fetchModuleInfo`
  fetches — could grey out or hide the methods the connected identity isn't
  permitted to call, instead of only finding out on submit.

## Full history

The condensed summary above reflects final state; the detailed narrative (why codegen
was dropped, the round where implementation paused pending an upstream pyobs-core
change, the wire-format corrections found while re-verifying against a moving HEAD, the
post-implementation bug hunts) is preserved in git history rather than duplicated here
— see `git log -p -- DEVELOPMENT.md`.
