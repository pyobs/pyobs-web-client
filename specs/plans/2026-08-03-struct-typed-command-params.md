# Plan: `struct<Name>`-typed command params

Status: done, 2026-09-14. `../pyobs-core`#898 landed the upstream schema publishing (a `<struct
name="...">` block sibling to `<enum>` inside `<types>`, one field element per struct field,
capped at one level of struct-in-struct nesting) while it was in progress in a parallel session —
the client side landed the same day against that draft shape. `InterfaceSchema`/`EventSchema` gain
a `structs: Record<string, FieldSchema[]>` (`pyobs-codec.ts`'s `parseStructs`, mirroring
`parseEnums`); `ParamForm.vue` recurses into a nested `<ParamForm>` for a `struct<Name>` param
whose fields are known, one level deep, matching the upstream depth cap. The nested form shares one
flat, dot-path-keyed model by reference at every level (e.g. `"elements.epoch"`) — the exact
convention `StructConfigForm.vue` already established for `IStructuredConfig` — rather than a
JSON-stringified sub-object with manual `:model-value`/`@update` wiring, which an earlier version
of this change used and which lost keystrokes on the first field or two typed into quickly (a
stale-snapshot race, found live-testing, not caught by unit tests since it only manifests under
real DOM/reactivity timing). `valueToXml` gained a struct branch mirroring pyobs-core's own
`_dataclass_to_xml` shape exactly (one child element named after each field, not a
`<dict>`/`<entry>` — that shape is `structValueToXml`'s, for a genuinely-a-dict `set_config` param,
not this). Live-verified end to end against `telescope.yaml`'s `DummyAltAzTelescope`: filled in a
full `OrbitalElements` nested form (7 fields + 1 optional), executed `track_orbital_elements`, and
got a real `AltitudeLimitError` back (not a decode crash) — the server actually propagated the
orbital elements and checked the resulting Alt/Az against the altitude limit — with `call_id`
matching the module's own log line exactly. Unit tests: `pyobs-codec.spec.ts`'s "struct<Name> param
support (pyobs-core#898)" describe block.

Repos: pyobs-web-client (consumer); `../pyobs-core` (wire-format change this
actually depends on, not yet proposed or implemented there)

Supersedes the "`struct<Name>`-typed command params" item originally in the (since-deleted)
repo-root `DEVELOPMENT.md`; see `specs/steering/open-items.md`.

## Problem statement

Unlike `enum(Name)`, whose values live in disco#info's `<types>` block (so
`ShellView.vue` can render a populated `<select>` purely from schema, no
hardcoded knowledge of the enum's members), a `struct<Name>` param or field
only ever gives the client the struct's *name* on the wire — `../pyobs-core`
doesn't publish the struct's field list (names, types, optionality) anywhere
in disco#info today. A client encountering a `struct<Name>` param has no way
to build an input form for it from schema alone; it would need out-of-band
knowledge of that specific struct's shape, defeating the whole point of this
client's live-schema-driven approach (no generated files, no hardcoded
per-interface knowledge — see `specs/design/pyobs-2-0-wire-protocol-client.md`).

## Current status: not actually blocking anything

Confirmed (as of the last check) no real command across any interface in
`../pyobs-core` takes a `struct`/`list`/`dict`-typed param — this is a
theoretical gap, not one blocking a real feature today. It's tracked here
because `specs/plans/2026-08-03-telescope-page.md`'s `IPointingOrbitalElements` entry
would hit it directly if implemented (`track_orbital_elements(elements)` takes
a struct-shaped param), which is the first concretely-identified interface
that would need this.

## What would need to change

- `../pyobs-core`'s disco#info schema generation would need to publish a
  struct's field list (name, type, optionality, unit if applicable) alongside
  its name — the same shape `enum(Name)`'s `<types>` block already provides
  for enums, generalized to structs. This is upstream work, not something this
  repo can do unilaterally.
- Once that lands, this client's `pyobs-codec.ts` would need a
  `StructFieldSchema`-equivalent parser (mirroring how enum values are parsed
  today) and `ShellView.vue`'s form builder would need a nested-form case for
  a struct param (likely: a sub-form of the struct's own fields, one level of
  recursion — structs containing structs not yet considered, cross that bridge
  if/when it comes up).

## Interim fallback, if a struct param is needed before upstream support lands

A raw-JSON textarea param — bypass schema-driven form generation entirely for
just that one param, let the operator type the struct's JSON representation
by hand. Worse UX than a real form, but unblocks the specific command without
waiting on an upstream wire-format change, and without inventing client-side
knowledge of any specific struct's shape (which would reintroduce the
per-interface hardcoding this client's whole design avoids). Only worth doing
if/when a real command actually needs it — not proposed as work to do now.

## Trigger to revisit

Re-open this plan (move it from "blocked" to "actionable") when either:
1. `../pyobs-core` publishes struct field schemas in disco#info, or
2. A real module needs `IPointingOrbitalElements` (or any other
   struct/list/dict-param interface) before (1) happens, forcing the interim
   fallback's use.
