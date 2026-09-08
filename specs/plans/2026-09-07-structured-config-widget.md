# Plan: Structured config widget (`IStructuredConfig`)

Status: All three phases built and live-verified — 2026-09-08. Phase 1 (flat fields) directly in
`ConfigView.vue`; Phase 2 (nested `object` fields) and Phase 3 (basic/expert `AccessLevel` toggle,
per-field descriptions) via the new recursive `src/components/StructConfigForm.vue`, which
`ConfigView.vue` now drives for the whole schema tree. Verified against a newly-ported fixture,
`testing/pyobs-gui-configs/xmpp/structuredconfig.yaml` (adapted from `pyobs-gui/test/`, running
`pyobs.modules.utils.dummystructuredconfig.DummyStructuredConfig`, which already exercises every
`ConfigFieldSchema` type including one nested field) — edited a nested field (`nested.threshold`)
and a flat field (`verbose`) together, applied, reloaded, and confirmed both round-tripped through
`set_config`/`ConfigAppliedState` correctly. `set_config`'s dict-typed param needed a codec
extension not anticipated by this plan — `structValueToXml` (`src/pyobs-codec.ts`) and
`executeMethodRaw` (`src/composables/useXmpp.ts`), see their own comments for why `valueToXml`/
`executeMethod` couldn't be reused as-is.

**Bug found and fixed during live verification**: `apply()`'s deep clone of the current applied
config used `structuredClone()`, which throws `DataCloneError` on a Vue-reactive object (the config
comes from a `ref`, so `configAppliedStateValue.value?.config` is a reactive Proxy, not a plain
object) — every Apply failed until this was caught live. Fixed with a `JSON.parse(JSON.stringify(...))`
round-trip instead, which both unwraps the proxy and clones in one step (safe here since every
`ConfigAppliedState` value is plain JSON-safe data by construction).

Repos: pyobs-web-client (all implementation here)

## Context

Registry row 18 in `specs/design/pyobs-gui-widget-parity.md`. `IStructuredConfig`
(`pyobs-core/pyobs/interfaces/IStructuredConfig.py`) is a distinct interface from the
already-tracked `specs/plans/2026-08-03-struct-typed-command-params.md` — that plan is about a
`struct<Name>`-typed *command parameter* inside an otherwise-normal RPC call (blocked upstream,
schema not on the wire yet); this is a whole separate schema-driven **module config** interface:
one `set_config(config: dict)` call applying a full, possibly-nested config object, with its own
`ConfigSchema`/`ConfigFieldSchema` published via capabilities and current values via
`ConfigAppliedState`. Not blocked on the same upstream gap — `IStructuredConfig` already publishes
its schema over the wire (`capabilities = ConfigSchema`), unlike the command-param case.

`pyobs-gui`'s `structuredconfigwidget.py` (608 lines) is the most elaborate widget in the app:
recursive field editors (including nested `object`-with-children fields), a basic/expert visibility
toggle per field (`AccessLevel`), descriptions rendered under each field, and an opaque-field
passthrough (a field the client can't render still round-trips its last known value through Apply
rather than being silently dropped).

## Scope for a first pass

Full parity with `structuredconfigwidget.py`'s recursive/nested editing is a lot for a first pass on
a client that has no other schema-driven full-object form yet (`ParamForm.vue` handles flat
per-command params, not a nested config tree). Scope down deliberately, matching this app's own
established pattern of shipping a device-specific core first and expanding later (`CameraView.vue`'s
phase split is the precedent):

- **Phase 1**: flat (non-nested) `ConfigSchema` fields only — reuse `ParamForm.vue`'s existing
  field-type rendering (it already handles the scalar/enum cases `ConfigFieldSchema` needs) staged
  into one form, applied via a single `set_config` call rather than `ParamForm`'s current
  one-command-per-call assumption (check whether `ParamForm.vue` needs a "stage without executing"
  mode it doesn't have today, or whether `CameraView.vue`'s own settings-panel pattern — stage into
  a local `Record<string, string>`, apply on a separate button — already covers this without
  `ParamForm.vue` changes).
- **Phase 2**: nested `object`-type fields (`ConfigFieldSchema.nested`) — a recursive field-group
  renderer, one collapsible section per nested object, each with its own field list. Needed for
  parity but deferred: no `IStructuredConfig` fixture in this repo's testing configs yet to verify
  against (not in `testing/pyobs-gui-configs/xmpp/`), so building the recursive case first risks
  guessing at a shape nothing can confirm.
- **Phase 3**: basic/expert `AccessLevel` toggle, per-field descriptions — cosmetic/UX parity,
  lowest priority of the three phases; the form is usable without it.
- **Current values**: `ConfigAppliedState` (the `state` field, distinct from `ConfigSchema`'s
  capabilities) — subscribe to it the same way every other widget subscribes to state, seed the
  form's initial values from it rather than schema defaults (matches `structuredconfigwidget.py`'s
  own current-value seeding, and this app's own established "seed from state when available, defaults
  otherwise" precedent from `CameraView.vue`'s settings panel).

## Registry

One new `MODULE_WIDGETS` entry, `IStructuredConfig` → `ConfigView.vue`, in `src/moduleWidgets.ts`.
Per the parity doc, this is **not** `sidebar_preferred` in `pyobs-gui` — it's a main page in its own
right even alongside another main widget (e.g. a spectrograph module implementing both
`ISpectrograph` and `IStructuredConfig` gets two tabs, not one absorbing the other) — keep that
behavior, don't demote it.

## Out of scope (this pass)

Nothing deferred — all three phases landed. `IFilters`-style per-field opaque passthrough (an
`object` field with no `nested` schema, i.e. a pydantic freeform dict) is still not editable, same
as pyobs-gui's own placeholder — flagged in the UI ("Not yet editable here: ...") rather than
silently dropped, but genuinely can't be built without a schema to render from.

## Open questions

None outstanding. (Resolved: a fixture now exists —
`testing/pyobs-gui-configs/xmpp/structuredconfig.yaml` — ported from `pyobs-gui/test/`.)

## References

- `pyobs-gui/pyobs_gui/structuredconfigwidget.py` — the widget this adapts (scoped down, see above).
- `pyobs-core/pyobs/interfaces/IStructuredConfig.py` — `ConfigSchema`/`ConfigFieldSchema`/
  `ConfigAppliedState`, the wire shapes involved.
- `pyobs-core/pyobs/utils/config_schema.py` — `ConfigFieldSchema`'s `level`/`description` fields and
  the dataclass/pydantic → schema derivation.
- `pyobs-core/pyobs/modules/utils/dummystructuredconfig.py` — the fixture module verification used,
  exercising every field type including one nested field.
- `specs/design/pyobs-gui-widget-parity.md` — registry row 18.
- `specs/plans/2026-08-03-struct-typed-command-params.md` — the *different*, still-blocked
  command-param problem; don't conflate the two.
- `src/components/ParamForm.vue` — the flat-field-form renderer Phase 1 reuses; `StructConfigForm.vue`
  (Phases 2/3) is a separate recursive renderer, not built on top of `ParamForm.vue`.
