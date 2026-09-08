# Plan: Structured config widget (`IStructuredConfig`)

Status: Phase 1 built (`ConfigView.vue`), not yet live-verified — 2026-09-08. Phases 2/3 (nested
fields, basic/expert toggle) remain deferred, per this plan. `set_config`'s dict-typed param needed
a codec extension not anticipated by this plan — `structValueToXml` (`src/pyobs-codec.ts`) and
`executeMethodRaw` (`src/composables/useXmpp.ts`), see their own comments for why `valueToXml`/
`executeMethod` couldn't be reused as-is.

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

- Nested-object editing (Phase 2 above) and basic/expert toggling (Phase 3) — explicitly deferred,
  not forgotten; revisit once a real fixture exists to verify the nested case against.

## Open questions

- No `IStructuredConfig` test fixture exists in `testing/pyobs-gui-configs/xmpp/` — worth porting
  one from `pyobs-gui`'s own `test/*.yaml` (per `specs/steering/testing-against-live-backend.md`'s
  established adaptation process) before or alongside implementation, so Phase 1 has something real
  to verify against rather than a hand-invented schema.

## References

- `pyobs-gui/pyobs_gui/structuredconfigwidget.py` — the widget this adapts (scoped down, see above).
- `pyobs-core/pyobs/interfaces/IStructuredConfig.py` — `ConfigSchema`/`ConfigFieldSchema`/
  `ConfigAppliedState`, the wire shapes involved.
- `specs/design/pyobs-gui-widget-parity.md` — registry row 18.
- `specs/plans/2026-08-03-struct-typed-command-params.md` — the *different*, still-blocked
  command-param problem; don't conflate the two.
- `src/components/ParamForm.vue` — the existing flat-field-form renderer Phase 1 reuses.
