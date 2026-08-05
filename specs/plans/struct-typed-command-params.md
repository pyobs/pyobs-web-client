# Plan: `struct<Name>`-typed command params

Status: blocked on upstream — not actionable in this repo alone until
`../pyobs-core` publishes struct field schemas on the wire. Captured as a plan
so the dependency and its trigger condition are tracked, not because there's
client-side design work to do yet.

Repos: pyobs-web-client (consumer); `../pyobs-core` (wire-format change this
actually depends on, not yet proposed or implemented there)

Supersedes the "`struct<Name>`-typed command params" Todo item in
`DEVELOPMENT.md`.

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
per-interface knowledge — see `DEVELOPMENT.md`'s intro).

## Current status: not actually blocking anything

Confirmed (as of the last check) no real command across any interface in
`../pyobs-core` takes a `struct`/`list`/`dict`-typed param — this is a
theoretical gap, not one blocking a real feature today. It's tracked here
because `specs/plans/telescope-page.md`'s `IPointingOrbitalElements` entry
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
