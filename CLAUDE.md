# CLAUDE.md

Entry points for working in this repo.

## What this is

`pyobs-web-client` is a Vue 3 web client for `pyobs` (the Institute for
Astrophysics Göttingen's telescope-control framework, `../pyobs-core`). It
re-implements pyobs-core 2.0's XMPP wire protocol by hand — raw Strophe.js
stanzas for disco#info, XEP-0009 RPC, and PubSub — rather than depending on any
build-time codegen against the Python interfaces. See `DEVELOPMENT.md` for
current implementation status.

## Design history and planning

- **`specs/design/`** — living architecture/design docs, one per feature or
  subsystem. Kept around after landing, not deleted.
- **`specs/plans/`** — implementation plans, checklist-style.
- **`specs/adrs/`** — short decision records for choices with genuine
  considered-and-rejected alternatives (MADR-lite: Context, Considered Options,
  Decision Outcome, Consequences).
- **`specs/steering/`** — standing, topic-scoped contributor guidance.

See `specs/index.md` for the full convention, including how this relates to
`pyobs-core`'s own `specs/` tree (some docs — the wire protocol, fleet-wide
steering — genuinely live there instead, tagged `Repos:`).

`DEVELOPMENT.md` (repo root) is the condensed, current-state overview: what the
client does today, what's tested, what's still open (Todo section). All design docs,
implementation plans, and ADRs belong in `specs/`, not inline in `DEVELOPMENT.md`.

## Standing constraint

Every design must work on mobile *and* desktop — not weighed per-feature, a
blanket bar every layout must clear. See `DEVELOPMENT.md`'s "Standing
constraint" section for the detail and precedent.

## Tooling

- Type checking: `vue-tsc --build` (`npm run type-check`)
- Unit tests: Vitest + jsdom (`npm run test:unit`, or `test:unit:watch`)
- E2e tests: Playwright (`npm run test:e2e`) — drives the real app against a
  live ejabberd server + real pyobs-core modules, no mocked backend; see
  `playwright.config.ts` and `README.md` for setup
- Dev server: `npm run dev` (Vite)
- Build: `npm run build` (type-check + `vite build`)
- No lint/format tooling configured yet (no ESLint/Prettier config in the repo)

## Cross-repo context

`../pyobs-core` is checked out as a sibling directory and used as a live
reference (interfaces, wire format, VFS behavior) during development — this
repo has no build-time dependency on it, no generated files, no local checkout
requirement to build or run. Grounding notes throughout `DEVELOPMENT.md` and
`specs/` cite specific `../pyobs-core` files/line numbers checked at the time;
treat those as a snapshot, not a live guarantee — re-check against current
`pyobs-core` state before relying on one that's aged.
