# pyobs-core 2.0 wire protocol — client-side implementation

Status: implemented, closed.

Repos: pyobs-web-client (this doc covers only this client's own implementation); the protocol
design itself is `pyobs-core/specs/design/pyobs_2_0_wire_protocol.md` (`Repos: pyobs-core,
pyobs-web-client`) — don't duplicate that document's reasoning here, this one only records how
this specific client implements the protocol it defines.

This client speaks pyobs-core 2.0's wire protocol natively, with no build-time codegen —
everything is discovered live from each module's own disco#info response. Previously tracked
inline in `DEVELOPMENT.md`'s "Status: done" section; moved here once that section had no further
open work attached to it. The full research/decision trail (codegen-vs-live-schema, the pause for
upstream changes, bug hunts along the way) is in git history, not duplicated here — see
`git log -p -- DEVELOPMENT.md`.

## Implementation

- **`src/pyobs-codec.ts`**: generic value↔XML codec for `urn:pyobs:rpc:1` (schema-less decode,
  schema-driven encode) plus parsers for the `<pyobs:interface>`/`<{ns}event>` disco#info schema
  blocks. See the file's own header comments for the wire vocabulary.
- **`src/composables/useXmpp.ts`**: `fetchModuleInfo` parses live interface/event schemas and
  capabilities from one disco#info query per module; `executeMethod` builds RPC calls from a
  module's own fetched command schema; `subscribeState` is a ref-counted PubSub state
  subscription; presence drives module online/offline, with `probeRosterPresence()` sending
  directed presence probes to every roster contact right after connecting so already-online
  modules are discovered even if the server doesn't auto-probe on initial presence.
- **`ShellView.vue`**: a pyobs-gui-style console — a log of executed commands/replies on top, and
  a command builder below it that shows only one of module/method/params at a time
  (accordion-style: picking a value collapses that layer into a tappable one-line summary and
  advances to the next). RPC forms are built from live command schemas — scalar, `datetime`, and
  `enum(Name)` (rendered as a populated `<select>`) params all work, optional-vs-required defaults
  are handled correctly, and clicking Execute fully resets the builder back to the module picker.
- **`DashboardView.vue`** / **`ModuleStateCard.vue`** / **`KeyValueCard.vue`**: generic
  capability/state rendering, no per-interface hardcoding.
- **`LoggingView.vue`**: live `LogEvent`s via versioned event PubSub nodes.
- No generated files, no local `../pyobs-core` checkout dependency — `generate-interfaces.{py,sh}`
  and `pyobs-interfaces.ts` were deleted along with the npm script that ran them.

## Testing

- Unit tests (`npm run test:unit`, Vitest + jsdom) cover the codec: scalar/list/dict/dataclass
  decode, encode round-trip (including int32-vs-float64 disambiguation by declared type), schema
  parsing.
- E2e tests (`npm run test:e2e`, Playwright, `e2e/`) drive the real app against a live ejabberd
  server + real pyobs-core modules — no mocked backend.
- Manually verified live against `admin@localhost` with a real `camera` module: Shell RPC calls
  (success + fault paths, enum dropdowns), Dashboard capability/state cards (including
  nested/list/dict shapes), Logging events, and presence-probe-on-connect (roster query returns
  module accounts, directed probes populate the Dashboard on a fresh session).
