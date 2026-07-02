# Adapting to pyobs-core 2.0

Notes from investigating `../pyobs-core` (currently `2.0.0.dev9`, local checkout) to
figure out how `pyobs-web-client` should change. This is a research log, not a final
plan — it records what's confirmed vs. still open.

## Why this matters

The web client re-implements the pyobs XMPP wire protocol by hand in
`src/composables/useXmpp.ts` (raw Strophe.js stanzas: disco#info, XEP-0009 RPC,
PubSub). It was written against pre-2.0 pyobs-core. A lot changed in comm/interfaces
since `v1.47.0`, and some of it looks like it makes the client's job easier, not just
different.

## Confirmed changes in pyobs-core relevant to the web client

Source: `pyobs/comm/xmpp/xmppcomm.py`, `pyobs/interfaces/interface.py`, and
`git log v1.47.0..HEAD -- pyobs/comm pyobs/events pyobs/interfaces` in `../pyobs-core`.
No `2.0.0` section exists yet in `CHANGELOG.rst` (still dev), so this is read directly
from source/commits.

- **Versioned interface features.** Modules now advertise interfaces via disco#info
  as `urn:pyobs:interface:{Name}:{version}` (was previously unversioned, e.g.
  `pyobs:interface:{Name}`). `XmppComm._get_interfaces` only accepts a feature if the
  remote-advertised version matches the locally known `Interface.version` — a mismatch
  is treated as "not implemented" and logged (`_diagnose_missing_interface`).
- **Capabilities.** Interfaces can declare a `ClassVar[type | None] capabilities`
  dataclass (`Interface.capabilities`). Modules publish these as `<capabilities>`
  elements inside their own disco#info response (namespace
  `urn:pyobs:capabilities:{Interface}:{version}`), via a custom `get_info` handler
  (`XmppComm._get_disco_info`). Clients fetch them with a plain disco#info query
  (`_get_capabilities`) — no RPC call needed to ask "what are your limits/options".
- **State.** Interfaces can also declare a `ClassVar[type | None] state` dataclass.
  Live state is pushed over dedicated PubSub nodes,
  `pyobs:state:{module}:{Interface}:{version}` (namespace
  `urn:pyobs:state:{Interface}:{version}`), serialized via a generic
  `_dataclass_to_xml` / `_xml_to_dataclass` (de)serializer. Clients subscribe once
  (`_subscribe_state`) and get pushed updates plus the current value on subscribe —
  this replaces polling getter methods (e.g. `get_motion_status`) with a
  subscribe-and-receive model.
- **Module lifecycle/presence.** `ModuleState` (READY/ERROR/LOCAL/CLOSED) now rides on
  plain XMPP presence `<show>`/`<status>` (`_set_presence`, `_got_online`,
  `_got_presence_update`, `_jid_got_offline`). A client can get live
  online/offline/error status for every module from presence alone, no polling.
- **RPC layer rewritten** (`new RPC`, `unified serializer` commits) — still XEP-0009
  under the hood, but parameter/return (de)serialization now goes through the same
  dataclass (de)serializer used for state/capabilities, meaning RPC methods can accept
  more than flat primitives now.
- **Events** still ride PEP/PubSub as `pyobs:event:{EventName}`, JSON payload — this
  part looks unchanged from what `useXmpp.ts` already does.
- `ILatLon` interface was removed entirely (`34cb5826`).
- Base `Interface` now exposes `get_state`, `get_capabilities`, `wait_for_state` as
  first-class methods (`pyobs/interfaces/interface.py`).

## Confirmed staleness/breakage in the current web client

- `src/scripts/generate-interfaces.sh` defaults to installing **pyobs-core from PyPI**,
  not the local `../pyobs-core` checkout, unless called with an explicit path arg. The
  committed `src/pyobs-interfaces.ts` still contains `ILatLon` (removed in 2.0), so it
  was generated against a pre-2.0 release.
- `ShellView.vue`'s `ifaceNameFromFeature()` matches features starting with
  `'pyobs:interface:'`. Real features are now `urn:pyobs:interface:{Name}:{version}` —
  this prefix will never match, so **Shell's module/interface method listing is
  currently broken** against a 2.0 backend (would show zero methods for every module).
- `useXmpp.ts` has no concept of capabilities or state subscriptions at all — Dashboard
  just dumps the raw feature string list, and nothing surfaces live module status
  beyond bare online/offline (derived from XMPP presence, which happens to still work
  since presence itself is unchanged in shape, just semantically richer now).
- The interface generator (`generate-interfaces.py`) only extracts abstract method
  signatures with primitive param types (`number | string | boolean`). It has no
  handling for the new `state` / `capabilities` dataclasses, or for versioned feature
  strings.

## Where this points (not yet decided)

The recurring theme: 2.0 replaced a lot of "call a method to find out X" with
"subscribe/query structured data for X" (capabilities via disco#info, state via
PubSub, lifecycle via presence). That's plausibly what makes the client "way simpler":
less hand-rolled polling and RPC plumbing, more generic subscribe-and-render.

Concretely, this could mean:

1. Point `generate-interfaces.sh` at the local `../pyobs-core` checkout (or default to
   it during dev) so generated TS isn't stale, and extend the generator to also emit
   `state`/`capabilities` dataclass shapes, not just methods.
2. Fix (or replace) the versioned-feature parsing (`urn:pyobs:interface:{Name}:{version}`)
   in one shared place instead of duplicating the `pyobs:interface:` prefix check.
3. Have `useXmpp.ts` surface capabilities and live state generically (mirroring
   `XmppComm`'s own disco#info + PubSub state subscription logic) so views like
   Dashboard/Shell can show real module status instead of raw feature-string badges.
4. Possibly drop custom per-view polling/derived state entirely in favor of the
   subscribe-once state model now that it's pushed from the server side.

## Update: the RPC wire format itself changed (breaking, not just additive)

Read `pyobs/comm/xmpp/serializer.py` and `pyobs/comm/xmpp/rpc.py` in full. This is
bigger than "new optional features to adopt" — **Shell's RPC calls will not work
against a 2.0 backend at all**, because the payload encoding inside XEP-0009 changed:

- Old (what `useXmpp.ts` currently speaks): classic XML-RPC values directly inside
  `<value>` — `<value><i4>42</i4></value>`, `<value><string>foo</string></value>`, etc.
  Faults: standard XML-RPC `<fault><value><struct>...`.
- New (`urn:pyobs:rpc:1`, see `serializer.py` docstring): every value is wrapped in a
  `<pyobs:value xmlns="urn:pyobs:rpc:1">` container holding one of a fixed vocabulary
  of tags — `<boolean>`, `<int>`, `<double>`, `<string>`, `<nil>`, `<items>` (list),
  `<tuple>`, `<dict>` (entry/key/val pairs), or `<{namespace}state>` (nested dataclass,
  same shape used for state/capabilities). Faults are now
  `<fault><value><pyobs:fault xmlns="urn:pyobs:rpc:1"><exception>...</exception><message>...</message></pyobs:fault></value></fault>`.
- This **same vocabulary** (`value_to_xml`/`xml_to_value` in `serializer.py`) is reused
  for RPC params, RPC return values, state pubsub payloads, and capability payloads —
  one wire format instead of three separate ad hoc ones. That's the concrete "simpler"
  angle: the web client can implement one generic `valueToXml`/`xmlToValue` pair in TS
  and reuse it everywhere, rather of the current `toRpcValue`/`parseRpcValue` pair that
  only exists for RPC and only knows 3 primitive types.
- Confirmed method params/returns can now be full dataclasses, lists, tuples, dicts —
  not just flat primitives — so Shell's current "one text input per param" form model
  is already an incomplete fit for anything beyond scalars (not new in 2.0, but the
  gap is more visible now since state/capabilities make structured data commonplace).

## Update: confirmed real State/Capabilities dataclass shapes

From `pyobs/interfaces/ICooling.py`, `IMotion.py`, `IFilters.py`:

```python
# ICooling
@dataclass
class CoolingState:
    setpoint: Annotated[float, Unit.CELSIUS] | None
    power: Annotated[int, Unit.PERCENT] | None
    enabled: bool
    time: Time = field(default_factory=Time.now)

# IMotion — nested dataclass + list-of-dataclass example
@dataclass
class DeviceMotionStatus:
    name: str
    status: MotionStatus  # StrEnum

@dataclass
class MotionState:
    status: MotionStatus
    devices: list[DeviceMotionStatus] = field(default_factory=list)
    time: Time = field(default_factory=Time.now)

# IFilters — capabilities example
@dataclass
class FiltersCapabilities:
    filters: list[str] = field(default_factory=list)
```

So state/capabilities generation for TS needs to handle: `Annotated[T, Unit]`
(unwrap to `T`), `T | None`, nested dataclasses, `list[dataclass]`, `StrEnum` fields,
and a couple of common non-primitive field types (`Time`). Manageable with a similar
approach to the existing method-param extraction in `generate-interfaces.py`, but
needs its own code path since it walks dataclass fields, not method signatures.

## Confirmed: version-tagged interface features are brand new (as of today)

`git show 3b4911e9` (commit message: "Version-tag interface disco#info features to
detect mixed-fleet mismatches", dated 2026-07-01 — today) is the exact commit that
changed the feature format from `pyobs:interface:{name}` to
`urn:pyobs:interface:{name}:{version}`. Before that commit, `ShellView.vue`'s
`pyobs:interface:` prefix check was correct. So this isn't old drift — it's the
literal same-day tip of the 2.0 branch. Confirms the web client needs to track
`../pyobs-core` HEAD closely for now, not just "the 2.0 release" as a fixed target.

## Remaining open questions

- Haven't checked whether other `Comm` backends (`local`, `dummy`) matter here — web
  client only ever talks XMPP, so probably irrelevant, but not confirmed.
- `generate-interfaces.sh` needs to default to (or at least be run against) the local
  `../pyobs-core` checkout during this work, not PyPI, or every generated type will be
  stale again immediately. (Resolved in the plan below.)

Scope is resolved: fix the breaking RPC/interface-feature changes **and** add generic
state/capabilities support (Dashboard shows live module status), confirmed with the
user. Full implementation plan below.

## Implementation plan

Not yet approved for execution — captured here for reference. Original plan file:
`/home/husser/.claude/plans/parsed-wiggling-brooks.md`.

**Superseded — see [Re-pass: implementation plan without codegen](#re-pass-implementation-plan-without-codegen)
at the end of this doc.** User's call: codegen isn't just unnecessary now, it's
explicitly not wanted. Kept below for the reasoning trail that's still accurate (the
RPC value wire format in §3, the fault shape) — but §1/§2's `WireType`-in-generated-file
design and the generator itself are not what gets built.

### 1. New file `src/pyobs-codec.ts` — generic value↔XML codec

Pure logic, no XMPP dependency, port of `serializer.py`'s `value_to_xml`/`xml_to_value`.

```ts
export type WireType =
  | { kind: 'int' } | { kind: 'double' }   // split, not merged 'number' — Python
                                            // distinguishes int/float on the wire and
                                            // picks <int> vs <double> by declared type,
                                            // not runtime value
  | { kind: 'string' } | { kind: 'boolean' } | { kind: 'nil' }
  | { kind: 'list'; item: WireType }
  | { kind: 'dict'; key: WireType; val: WireType }
  | { kind: 'dataclass'; name: string; namespace: string; fields: Record<string, WireType> }
  | { kind: 'enum' }                        // StrEnum -> plain string on the wire
  | { kind: 'optional'; inner: WireType }
  | { kind: 'any' }

export function valueToXml(doc: Document, value: unknown, type: WireType): Element
export function xmlToValue(el: Element, type: WireType): unknown
export function dataclassToXml(doc: Document, value: Record<string, unknown>, namespace: string, tag: 'state' | 'capabilities', fields: Record<string, WireType>): Element
export function xmlToDataclass(el: Element, fields: Record<string, WireType>): Record<string, unknown>
export function localTag(el: Element): string   // port of tag.split('}')[-1], applied at every dispatch point (top-level and nested item/entry/key/val), since ejabberd round-trips can namespace any child
export type InterfaceRef = { name: string; version: number }
export function parseInterfaceFeature(feat: string): InterfaceRef | null   // urn:pyobs:interface:{name}:{version}
```

Vocabulary mirrors `serializer.py` exactly: `<boolean>`, `<int>`, `<double>`,
`<string>`, `<nil/>`, `<items><item>…</item></items>` (list), `<tuple>` (same shape),
`<dict><entry><key>…</key><val>…</val></entry></dict>`,
`<{namespace}state|capabilities><field>…</field></{namespace}...>` (dataclass, root
namespaced, fields plain).

Deliberate decisions:
- **Do not port the legacy scalar-text fallback** in `_xml_to_dataclass`/`_parse_scalar`
  — nothing on the wire produces that shape anymore; porting it just adds dead-code
  surface to something meant to be simpler.
- `Annotated[T, Unit]` and `T | None` unwrapping happens once, at generation time
  (`generate-interfaces.py` bakes the unwrapped `WireType`), not at codec runtime —
  TS has no runtime `Annotated` to unwrap anyway.

### 2. `scripts/generate-interfaces.py` / `.sh` — regenerate against local checkout

- `.sh`: default `PYOBS_CORE="${1:-../pyobs-core}"` (was `pyobs-core` from PyPI). PyPI
  still only has pre-2.0 releases, so regenerating against it right now just
  reproduces the current stale/wrong file (confirmed: committed `pyobs-interfaces.ts`
  still has `ILatLon`, removed in 2.0). Smoke-test that `pip install --no-deps
  ../pyobs-core` still installs cleanly under dev9's project layout before relying on
  this.
- `.py`: extend `process_interface` to also emit, per interface:
  - `version: int` (from `cls.version`, base default 1).
  - `state` / `capabilities`: `{ name, namespace: f"urn:pyobs:{state|capabilities}:{ClassName}:{version}", fields: Record<str, WireType> } | null`, via a new `dataclass_to_wiretype`/`py_type_to_wiretype` pair (mirrors `py_type_to_ts` but recurses into nested dataclasses and lists-of-dataclass, matches `WireType`'s `int`/`double` split, and maps `StrEnum` → `{kind:'enum'}`).
  - Use `cls.__dict__.get("state")` / `.get("capabilities")` (own-only), not inherited
    `getattr` — avoids a latent case where a subclass interface without its own
    `state` override would get the parent's state shape published under its own
    namespace. No interface in the current set actually hits this case, but own-only
    is the conservative choice.
  - `Time`-typed fields (e.g. `CoolingState.time`) need **no special handling** —
    confirmed `pyobs.utils.time.Time` subclasses `astropy.time.Time`, not `str`/`float`,
    so `value_to_xml` hits its stringify fallback and `xml_to_value` decodes it as a
    plain string (pyobs-core itself doesn't reconstruct a `Time` object from the wire
    either). Generate these fields as `{kind:'string'}`.
- Generated `InterfaceDef` type: `ParamDef.type` becomes `WireType` (was
  `'number'|'string'|'boolean'`); new `version`, `state`, `capabilities` fields added.
- Regenerate `src/pyobs-interfaces.ts` and confirm by diff: `ILatLon` gone,
  `ICooling`/`IMotion`/`IFilters` show non-null `state`/`capabilities`.

### 3. `useXmpp.ts` — RPC rewrite (fixes Shell)

Replace `toRpcValue`/`parseRpcValue` entirely. New `executeMethod(fullJid, methodName,
params: unknown[], paramTypes: WireType[], returnType: WireType)`:

- Build: `<params><param><value><pyobs:value xmlns="urn:pyobs:rpc:1">{valueToXml}</pyobs:value></value></param></params>`, one `<param>` per positional arg in declared order (matches `rpc.py`'s `params_to_xml`).
- Parse success: find the `pyobs:value` under `<params><param><value>`,
  `xmlToValue(children[0], returnType)`; empty `<params/>` → `null` (void return).
- Parse fault: `<fault><value><pyobs:fault xmlns="urn:pyobs:rpc:1"><exception>…</exception><message>…</message></pyobs:fault></value></fault>` → surface `{exception, message}` distinctly (not collapsed to one string) so the UI can show `ClassName: message`.
- XMPP-level IQ error parsing (`item-not-found` etc.) is unaffected by the wire-format
  change — leave as-is.
- `RpcResult` gains an optional `errorClass?: string`.

`parseInterfaceFeature` (from `pyobs-codec.ts`) replaces `ShellView.vue`'s
`ifaceNameFromFeature`. Only accept an interface if the remote-advertised version
matches `PYOBS_INTERFACES[name].version` — same behavior as pyobs-core's own client
(mismatch = treated as absent). Collect mismatches per module
(`PyobsModule.unmatchedInterfaces: InterfaceRef[]`) in `fetchModuleInfo` for the
Dashboard badge (§6).

`ShellView.vue`'s one-input-per-param form is kept as-is — every real interface method
today takes only primitive scalar params (grep-confirmed: `set_filter(filter_name:
str)`, `set_cooling(enabled, setpoint)`, `stop_motion(device: str | None)`, none take
list/dict/dataclass params). Only change: read `WireType` instead of the old
`ParamType` string when choosing the input widget (`int`/`double` → number input,
`boolean` → select, `string` → text; `optional`/nil affects the existing "(optional)"
label).

### 4. Capabilities — piggyback on `fetchModuleInfo`'s existing disco#info query

No new IQ round trip. `_get_disco_info` (pyobs-core) already appends `<capabilities>`
siblings of `<feature>` inside the same `<query>` `fetchModuleInfo` already parses.
For each version-matched interface with non-null `capabilities`, look for a
`<capabilities>` child namespaced `urn:pyobs:capabilities:{Interface}:{version}` and
decode with `xmlToDataclass`. Add `capabilities: Record<string, unknown>` (keyed by
interface name) to `PyobsModule`.

### 5. State subscription — reference-counted, mirrors `xmppcomm.py`'s subscribe model

New function on the `useXmpp()` return object:

```ts
function subscribeState(bareJid: string, interfaceName: string): { value: ComputedRef<unknown>; unsubscribe: () => void }
```

- Module-level `stateStore: Ref<Map<string /* "jid:Interface" */, unknown>>`, plus a
  ref-count map (`stateRefCounts`) and a set of nodes already subscribed
  (`stateNodeSubscribed`) — ejabberd tracks real subscriptions per (JID, node), so the
  client must not send a redundant `subscribe` IQ per component, and must only send
  `unsubscribe` when the *last* subscriber drops.
- Node naming matches `_state_node`/`_state_namespace`:
  `pyobs:state:{moduleUsername}:{InterfaceName}:{version}`, namespace
  `urn:pyobs:state:{InterfaceName}:{version}`.
- On first subscribe for a key: send `subscribe` IQ to `pubsub.{domain}`, retrying on
  `item-not-found` (publisher may not have published yet — same as pyobs-core's own
  `_subscribe_with_retry`, ~30 attempts / 1s apart, not an error to surface), then
  `get_items` (max_items=1) to fetch the current value in case a live push races the
  subscribe ack.
- `handlePubsubMessage` gains a second branch: `node.startsWith('pyobs:state:')` →
  look up the registered `{key, fields}` for that node, `xmlToDataclass`, reassign a
  new `Map` onto `stateStore.value` (stay consistent with this file's existing style
  of reassigning refs rather than mutating in place, e.g. `modules.value = [...]`).
- `unsubscribe()` decrements the ref count; at zero, sends the ejabberd `unsubscribe`
  IQ and drops bookkeeping.
- Consumers (Dashboard) call `subscribeState` and `unsubscribe()` in their own
  mount/unmount lifecycle.

### 6. Dashboard — generic state cards + version-mismatch badge

New `src/components/ModuleStateCard.vue`: given `{ interfaceName, state,
fields: Record<string, WireType> }`, renders label/value pairs generically
(`Object.entries`) — booleans as badges, numbers as-is, nested/list fields via the
same compact-JSON fallback `ShellView.vue` already uses for RPC results
(`formatResult`, worth extracting to a shared util both can import). No per-interface
hardcoding (no "if ICooling then show temp" branches) — this is what keeps it
data-driven per the user's ask.

`DashboardView.vue`: for each module, for each version-matched interface with
non-null `PYOBS_INTERFACES[name].state`, call `subscribeState` and render a
`ModuleStateCard` when a value is available. Also render a small warning badge (e.g.
"interface version mismatch: IFoo (remote v2, client v1)") when
`module.unmatchedInterfaces` is non-empty.

### Sequencing

Each phase is independently buildable/type-checkable, and later phases depend on
earlier ones:

1. `pyobs-codec.ts` (self-contained).
2. Generator changes + regenerate `pyobs-interfaces.ts` against `../pyobs-core` — hard
   prerequisite for 3–4 (they consume the new generated shape).
3. RPC rewrite (`useXmpp.ts` + `ShellView.vue`) — fixes the currently-broken Shell,
   independently shippable.
4. Capabilities in `fetchModuleInfo`.
5. State subscription + Dashboard cards — largest, most novel piece; done last.

### Critical files

- `src/pyobs-codec.ts` (new)
- `src/pyobs-interfaces.ts` (regenerated, not hand-edited)
- `scripts/generate-interfaces.py`, `scripts/generate-interfaces.sh`
- `src/composables/useXmpp.ts`
- `src/views/ShellView.vue`
- `src/views/DashboardView.vue`
- `src/components/ModuleStateCard.vue` (new)
- Reference only, not modified: `../pyobs-core/pyobs/comm/xmpp/{serializer,rpc,xmppcomm}.py`, `../pyobs-core/pyobs/interfaces/interface.py`

### Verification

- `npm run type-check` and `npm run build` after each phase — the `WireType`/
  `InterfaceDef` shape changes are exactly what `vue-tsc` catches immediately given
  how tightly `ShellView.vue` destructures `param.type` today.
- **Live end-to-end verification against the real ejabberd server**: a live server
  with real pyobs-core `2.0.0.dev9` modules (`camera`, `telescope`, …, password
  `pyobs`, TLS errors ignored) is available at `localhost`. Run `npm run dev`, log
  in, and exercise: Shell RPC calls against a real module (e.g. `set_filter` on a
  filter wheel, checking both success and a deliberate-failure fault path),
  capabilities showing up on Dashboard for modules that publish them, live state
  updates rendering and updating on Dashboard. This is the primary correctness check
  for the new wire-format code, in place of synthetic unit tests — skipping added
  test infra (vitest) for this pass since real end-to-end verification is available
  and more authoritative than a mocked round-trip test would be.
- Before connecting to the live server for the first time, confirm with the user
  which account/resource the web client itself should log in as (reusing one of the
  existing module accounts with a distinct XMPP resource, e.g.
  `camera@localhost/webclient`, vs. a separate dedicated account) — not yet
  established.

### Open items carried forward (low-risk, noted for the record)

- `int`/`double` `WireType` split is a breaking rename of the generated file's shape,
  contained entirely within this codebase — no external consumers.
- Own-only (`__dict__.get`) state/capabilities extraction is the conservative choice;
  revisit if live testing surfaces an interface where inherited state should have
  been picked up.

## Paused: pyobs-core needs a change first

Two corrections to the plan above, from re-checking assumptions before starting
implementation:

- **XmppComm only.** Confirmed with the user — `local`/`dummy` `Comm` backends are out
  of scope, the web client only ever needs to speak XMPP.
- **State/capabilities don't need codegen at all.** The wire format is genuinely
  self-describing: every value is wrapped in a tagged element (`<int>`, `<double>`,
  `<string>`, `<boolean>`, `<nil>`, `<items>`, `<dict>`, `<{ns}state>`), so a generic
  recursive decoder can render arbitrary state/capability payloads with no
  pre-generated field-type schema. §2 and §6 of the plan above (extending the
  generator to emit `state`/`capabilities` `WireType` shapes) are unnecessary —
  decode dynamically instead.

But RPC method **calls** are a different story — checked `pyobs/comm/proxy.py`
(pyobs-core's own Python-side client proxy): it does **not** introspect the remote
over the wire either. It matches the disco#info-advertised interface name+version
against a **locally installed copy of the same `pyobs.interfaces` Python package**
and pulls method signatures from that shared, pre-known contract. There is no
XEP-0009 (or other) introspection call that returns method names/params/docs over
XMPP. So a JS client genuinely cannot know what params `set_filter` takes, or that it
exists, without either (a) a generated file mirroring the Python interfaces (today's
approach, keeps working for methods even though it's now unneeded for
state/capabilities), or (b) pyobs-core itself gaining a wire-level way to describe
method signatures — which doesn't exist yet.

User's call: **stop the web client work here and change pyobs-core first** — add
whatever's needed there so RPC method introspection also becomes wire-native, fully
realizing the "no shared codegen needed" idea for 2.0. Web client implementation is
on hold pending that.

## Unpaused: pyobs-core now publishes full wire-native schemas

Re-checked `../pyobs-core` at `700ba457` (2026-07-02), including its own
`DEVELOPMENT.md` (`v0.47`, now an implementation log rather than a design doc, with a
dedicated "Phase 7 — pyobs-web-client catch-up" section). The exact gap the pause above
was blocked on is closed:

- **RPC method schemas are now wire-native.** `pyobs/comm/xmpp/serializer.py:
  _interface_schema_to_xml`, wired into disco#info via
  `xmppcomm.py:_get_disco_info`, emits one `<pyobs:interface>` block per interface
  containing `<command name="...">` elements with typed `<parameter name="..."
  type="..." unit="...">` children (types: `int32`, `float64`, `bool`, `string`,
  `datetime`, `enum(Name)`, `struct<Name>`), a `<types>` block with `<enum>` value
  lists for any enum params/fields referenced, a `<state node="...">` block (fields,
  same type vocabulary) when the interface declares `state`, and sibling
  `<capability name="..." type="...">value</capability>` elements for fixed-lifetime
  values. One disco#info query now returns everything needed to both *call* a method
  and *render* a form for it — the missing piece from the "Paused" section above.
- **Event schemas/versioning are also now implemented** (this was still open as of
  the previous check, closed since in `9c19e512`/`700ba457`): `xmppcomm.py:680` adds
  `urn:pyobs:event:{name}:{version}` disco#info features (was unversioned
  `pyobs:event:{name}`), `:685` uses the same versioned string for XEP-0163 PEP
  interest, and `:843` (`_get_disco_info`, `local == "event" and
  ns.startswith("urn:pyobs:event:")`) publishes a typed `<{ns}event>` schema block per
  event class, same shape as interface schemas.
- **RPC value wire format is unchanged** from what this doc already described —
  confirmed still matches: `urn:pyobs:rpc:1`, `<int>`/`<double>`/`<string>`/
  `<boolean>`/`<nil>`/`<items>`/`<tuple>`/`<dict>` value tags in `serializer.py`, fault
  shape `<fault><value><pyobs:fault xmlns="urn:pyobs:rpc:1"><exception>…</exception>
  <message>…</message></pyobs:fault></value></fault>` in `rpc.py`. Nothing in §1/§3 of
  the implementation plan above needs revising on this front.

**Implication beyond what the plan above assumed:** §1 of the plan already correctly
guessed state/capabilities don't need codegen (self-describing wire format). That now
extends to *commands* too — the entire per-interface IDL (types, commands+params,
state, capabilities) is derivable from one disco#info query, not just state/
capabilities. `generate-interfaces.py`'s build-time extraction (§2 of the plan) is now
fully optional rather than a hard prerequisite for RPC calls — pyobs-core's own Phase 7
notes list "retire the extraction script for live disco#info fetching" as an explicit
option. Whether to actually drop codegen (build-time generated TS vs. runtime-fetched
schema) is a real design choice with its own tradeoffs (type safety/autocomplete vs.
always-fresh schema, one disco#info round-trip per module on connect either way for
capabilities today) — not yet decided, worth revisiting before resuming
implementation given how much of the plan above (§2, §3's `WireType`, the generator
changes) was written assuming codegen was the only option.

Blocker lifted. Implementation plan above needs a re-pass before resuming — it was
written under the assumption that commands still required generated TS from a local
Python checkout; that assumption no longer holds.

## Re-pass: implementation plan without codegen

**Decision (user): codegen is not just optional, it's not wanted.** The client fetches
interface/event schemas live from disco#info on every connect; nothing is
pre-generated from a local `../pyobs-core` checkout, ever. This section supersedes §1–6
of the "Implementation plan" above. Re-verified directly against
`../pyobs-core@700ba457`'s actual code (`pyobs/comm/xmpp/serializer.py`,
`xmppcomm.py`) while writing this, not just its design doc's illustrative XML — one
discrepancy surfaced, noted in §3.

### 1. New file `src/pyobs-codec.ts` — schema-less decode, schema-driven encode

Decoding and encoding have genuinely different information needs, because the wire
vocabulary is self-tagging on the way out but not on the way in:

**Decoding needs no schema at all.** Every value already on the wire — RPC returns,
state pushes, capability values — carries its own type as the element tag:
`<boolean>`, `<int>`, `<double>`, `<string>`, `<nil/>`,
`<items><item>…</item></items>`, `<tuple>` (identical shape to `<items>`, no reason
for the client to distinguish them — both become a JS array),
`<dict><entry><key>…</key><val>…</val></entry></dict>`, or a dataclass element (any
tag not in that list — its children are one `<fieldName>` wrapper per field, each
wrapping one more self-tagged value, recursively — this is how `_dataclass_to_xml`
serializes both state and, per §3 below, capabilities). One function covers all of it:

```ts
export function localTag(el: Element): string   // tag.split('}').pop(), ejabberd may namespace any element on round-trip
export function xmlToValue(el: Element): unknown   // fully generic, no type argument — dispatches on localTag(el) alone
```

`xmlToValue` recurses into `<items>`/`<tuple>` → `unknown[]`, `<dict>` → `Record<string,
unknown>` (or `Map` if keys aren't always strings — keys are `xmlToValue`'d too, so
technically not guaranteed string; a plain `dict` param/field is the only place this
could bite, revisit if one shows up with non-string keys), anything else unrecognized
→ walk `Array.from(el.children)`, one field per child, `{ [localTag(child)]:
xmlToValue(child.children[0]) }`. `StrEnum` values need no special casing on decode —
they're plain `<string>` on the wire (`serializer.py:98-101`), so they just decode to a
JS string.

**Encoding needs the target type**, because a plain JS input (e.g. a string typed into
a form field) is ambiguous — `"5"` could be meant as `<int>` or `<double>` — and RPC
call params must match the callee's declared type. This is the one place the client
still needs a schema, fetched live (§3), not generated:

```ts
export type WireType =
  | 'bool' | 'int32' | 'float64' | 'string' | 'void' | 'datetime'
  | { kind: 'enum'; name: string }
  | { kind: 'struct'; name: string }
  | { kind: 'array'; item: WireType }
  | { kind: 'optional'; inner: WireType }

export function parseWireType(typeStr: string): WireType
  // parses the *schema* type-string vocabulary emitted by pyobs-core's
  // `_wire_type()` (serializer.py:343): "bool", "int32", "float64", "string",
  // "void", "datetime", "enum(Name)", "struct<Name>", "array<T>", "optional<T>" —
  // NOT the same vocabulary as the value tags above (schema says "int32", a value
  // on the wire says "<int>") — two different jobs, deliberately not unified.

export function valueToXml(value: unknown, type: WireType): Element
  // only used for RPC call params built from user input; return values never
  // need this, they're decoded with xmlToValue instead.
```

**Schema-block parsers**, for the `<pyobs:interface>`/`<{ns}event>` disco#info
elements (§3 supplies the raw `Element`, parsed once per `fetchModuleInfo` call):

```ts
export type CommandSchema = { name: string; params: { name: string; type: WireType; unit?: string }[] }
export type StateSchema = { node: string; fields: { name: string; type: WireType; unit?: string }[] }
export type InterfaceSchema = {
  name: string; version: number
  enums: Record<string, string[]>   // from <types><enum name=.. ><value>..</value></enum></types>
  commands: Record<string, CommandSchema>
  state: StateSchema | null
}
export type EventSchema = { name: string; version: number; enums: Record<string, string[]>; fields: { name: string; type: WireType; unit?: string }[] }

export function parseInterfaceSchema(el: Element): InterfaceSchema   // one <{urn:pyobs:interface:Name:version}interface> element
export function parseEventSchema(el: Element): EventSchema           // one <{urn:pyobs:event:Name:version}event> element
export type VersionedFeature = { name: string; version: number }
export function parseVersionedFeature(prefix: 'interface' | 'state' | 'event', feat: string): VersionedFeature | null
  // urn:pyobs:{prefix}:{name}:{version} — one function, not three near-duplicates
```

Deliberate decisions:
- **No legacy scalar-text fallback** ported (same call as the original plan's §1 —
  still correct, nothing on the wire produces `_parse_scalar`'s shape).
- **`struct<Name>`-typed params can't be form-built from schema alone.** Unlike
  `enum(Name)`, whose values live in the same `<types>` block, a `struct<Name>`
  param/field only ever gives you the *name* — pyobs-core doesn't publish that
  struct's own field list anywhere in disco#info (confirmed: `_interface_schema_to_xml`
  only ever adds `<types><enum>` entries, never a `<struct>` counterpart). Not an
  issue today — grep-confirmed no real command takes a struct/list/dict param, same
  finding the original plan already made — but if one appears, the client genuinely
  cannot build an input widget for it without pyobs-core publishing struct field
  schemas too. Flagged, not built for.

### 2. Delete the codegen path entirely

- Delete `scripts/generate-interfaces.py`, `scripts/generate-interfaces.sh`,
  `src/pyobs-interfaces.ts`.
- No local `../pyobs-core` checkout dependency for the client to build or run
  correctly, against any server version — schema is discovered live from whatever
  module the client is actually talking to.
- Direct consequence: a mixed-version fleet just works per-module. Module A on
  `ICooling:1` and module B on `ICooling:2` each render from their own live schema —
  there's no single "the client's known `ICooling` shape" to compare against, so the
  original plan's "version-mismatch" diagnostic (`unmatchedInterfaces`, comparing a
  remote-advertised version against a locally-known `Interface.version`) doesn't apply
  the same way anymore and is dropped, not carried forward — see §6.

### 3. `useXmpp.ts` — `fetchModuleInfo` becomes the one schema source

Extend the disco#info parsing `fetchModuleInfo` already does, per module:

- For each child element whose namespace starts with `urn:pyobs:interface:`,
  `parseInterfaceSchema` it into `PyobsModule.interfaces: Record<string,
  InterfaceSchema>` (keyed by interface name — version comes off the schema's own
  parsed `xmlns`, not a comparison against anything local).
- For each child element whose namespace starts with `urn:pyobs:event:`,
  `parseEventSchema` it into `PyobsModule.events: Record<string, EventSchema>` —
  optional for Phase 3/6 below (only needed if Shell/Dashboard end up listing event
  schemas, not required for RPC/state/capabilities to work).
- For each child element whose namespace starts with `urn:pyobs:capabilities:`,
  `xmlToValue` it (fully generically, per §1) into `PyobsModule.capabilities:
  Record<string, Record<string, unknown>>`, keyed by interface name.
  **Correction to the "Unpaused" section above**: I described `<capability name="..."
  type="...">value</capability>` scalar elements there, copying pyobs-core's *design
  doc* illustration — but the actual `_get_disco_info` code
  (`xmppcomm.py:846-850`) builds this via `_dataclass_to_xml(caps, ns,
  tag="capabilities")`, the exact same self-describing field-wrapper shape `state`
  uses, not the scalar form. (`_capability_type`/`_CAPABILITY_NS` at
  `xmppcomm.py:33-44` do match the scalar-form sketch, but grep confirms they're dead
  code — never called anywhere in that file. Worth a heads-up upstream; doesn't affect
  the client either way since `xmlToValue` handles whatever shape is actually on the
  wire without caring which one pyobs-core meant to ship.)
- `parseVersionedFeature('interface'|'state'|'event', feat)` replaces `ShellView.vue`'s
  `ifaceNameFromFeature` prefix check, reading straight off `<feature var="urn:pyobs:
  ...:{name}:{version}">` — no comparison against a locally-known version, because
  there's no local copy of anything to compare against anymore.

### 4. RPC rewrite (`useXmpp.ts` + `ShellView.vue`) — schema from the module, not an import

`executeMethod(fullJid, methodName, params: unknown[], commandSchema: CommandSchema)`:

- `commandSchema` comes from `module.interfaces[ifaceName].commands[methodName]` —
  already fetched by `fetchModuleInfo`, zero extra round trips.
- Build `<params><param><value><pyobs:value xmlns="urn:pyobs:rpc:1">
  {valueToXml(params[i], commandSchema.params[i].type)}</pyobs:value></value></param>
  </params>` — same envelope the original plan described, `valueToXml` now taking a
  live-parsed `WireType` instead of a generated one.
- Parse success: `xmlToValue` on the returned `pyobs:value` child — no return-type
  argument needed at all, decoding is schema-less (§1). Empty `<params/>` → `null`.
- Parse fault: unchanged from the original plan — `{exception, message}` from
  `<pyobs:fault>`, surfaced distinctly, `RpcResult` gains `errorClass?: string`.
- `ShellView.vue` renders one input per `commandSchema.params[i]`: `int32`/`float64` →
  number input, `bool` → select, `string`/`datetime` → text, `enum(Name)` → a real
  `<select>` populated from `module.interfaces[ifaceName].enums[Name]` — this was
  pyobs-core's own Phase 7 "optional" item, now essentially free since the enum values
  arrive in the same `fetchModuleInfo` call, no extra plumbing needed to get them.
  `optional<T>` affects the existing "(optional)" label the same way `nil`-ability did
  in the original plan.

### 5. State subscription — node path from live schema, decode fully generic

Same ref-counted design the original plan already worked out (module-level
`stateStore`, `stateRefCounts`, `stateNodeSubscribed`, retry-on-`item-not-found`
matching `_subscribe_with_retry`) — two changes from schema-less decode:

- Node path read straight from `module.interfaces[name].state.node` (the schema's own
  `node` attribute, `state/{Interface}/{version}`, matching `_state_node`) instead of
  built from a generated constant.
- `handlePubsubMessage`'s state branch is just `xmlToValue(payload)` — no `fields:
  Record<string, WireType>` lookup, because decoding never needed the schema to begin
  with.

### 6. Dashboard — generic state cards, no version-mismatch badge

`ModuleStateCard.vue`: given `{ interfaceName, value: unknown }` (no `fields` prop —
dropped, decode doesn't produce or need one), renders `Object.entries(value as
Record<string, unknown>)` generically, branching on `typeof` per value (boolean →
badge, number/string → as-is, object/array → the same compact-JSON fallback
`ShellView.vue` already has for RPC results, `formatResult`, worth extracting to a
shared util both import).

`DashboardView.vue`: for each module, for each interface present in
`module.interfaces` with a non-null `.state`, call `subscribeState` and render a
card. The version-mismatch badge from the original plan's §6 is dropped — see §2,
there's no local version to mismatch against, each module's card just renders
whatever that module's own live schema says.

### Sequencing

1. `pyobs-codec.ts` (self-contained) — generic decoder, schema-string parser,
   interface/event schema-block parsers.
2. Delete codegen artifacts (`generate-interfaces.py`/`.sh`, `pyobs-interfaces.ts`) —
   do this alongside step 3 so there's no window with a dangling stale import.
3. `fetchModuleInfo` extended to parse interface/event schemas + capabilities live —
   hard prerequisite for 4–6, they all consume `PyobsModule.interfaces`/`.capabilities`.
4. RPC rewrite (`useXmpp.ts` + `ShellView.vue`) — fixes the currently-broken Shell,
   independently shippable once 3 lands.
5. State subscription + Dashboard cards — largest, most novel piece, done last.

### Critical files

- `src/pyobs-codec.ts` (new)
- `src/composables/useXmpp.ts`
- `src/views/ShellView.vue`
- `src/views/DashboardView.vue`
- `src/components/ModuleStateCard.vue` (new)
- Deleted: `scripts/generate-interfaces.py`, `scripts/generate-interfaces.sh`,
  `src/pyobs-interfaces.ts`
- Reference only, not modified:
  `../pyobs-core/pyobs/comm/xmpp/{serializer,rpc,xmppcomm}.py`

### Verification

Same approach the original plan settled on, still the right call — real end-to-end
verification against a live server is more authoritative than a mocked round-trip test
for wire-format code, so no added test infra (vitest) for this pass either:

- `npm run type-check` and `npm run build` after each phase.
- **Live end-to-end verification against the real ejabberd server**: log in via
  `npm run dev` and exercise Shell RPC calls against a real module (success and a
  deliberate-failure fault path, including an `enum`-typed param rendering as a
  dropdown), capabilities showing up on Dashboard, live state updates rendering and
  updating.
- Before connecting to the live server for the first time, confirm with the user
  which account/resource the web client itself should log in as — not yet
  established, unchanged from the original plan's note.

### Open items carried forward

- `struct<Name>`-typed command params can't be form-built from schema alone (§1) — not
  needed today, revisit if pyobs-core ever adds one; would need pyobs-core to publish
  struct field lists the way it already does for enums via `<types>`.
- pyobs-core's `_capability_type`/`_CAPABILITY_NS` dead code (`xmppcomm.py:33-44`,
  §3) — worth flagging upstream, doesn't block the client either way.