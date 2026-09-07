# Design history and planning

This project has its own `specs/` structure, following the pattern `pyobs-core`
established first (see `pyobs-core/CLAUDE.md`'s "Design history and planning"
section) — but as its own tree, not folded into `pyobs-core`'s. Unlike
`pyobs-gui`/other sibling repos (which are thin drivers of `pyobs-core`'s own
interfaces and just carry a one-line pointer back), `pyobs-web-client` is a
substantial, independent codebase in its own right — a different language, a
hand-rolled wire-protocol implementation, its own UI/UX design space — and earns
a full structure of its own rather than being a footnote in `pyobs-core`'s.

- **`design/`** — living architecture/design docs, one per feature or subsystem.
  Kept around after landing (`status: implemented`), not deleted — check here
  before re-deriving the reasoning behind existing behavior.
- **`plans/`** — implementation plans, checklist-style.
- **`adrs/`** — short decision records for choices that had genuine
  considered-and-rejected alternatives (MADR-lite: Context, Considered Options,
  Decision Outcome, Consequences).
- **`steering/`** — standing, topic-scoped contributor guidance (e.g. "every
  design must work on mobile and desktop"), once a real recurring convention
  warrants its own doc.

This repo has no root-level status doc — `design/index.md` is the
completed-feature catalog and `plans/index.md` tracks what's still open,
matching `pyobs-core`'s own layout (no equivalent doc there either). A root
`DEVELOPMENT.md` served this purpose until 2026-09-07, when its content was
folded into this tree (mostly already duplicated here as one-line pointers)
and the file deleted; its pre-`specs/` narrative history (codegen-vs-live-schema
decision, the pause for upstream changes, bug hunts) is preserved in git
history, not duplicated here — see `git log -p -- DEVELOPMENT.md`.

## Cross-repo docs

Some design decisions are genuinely about the wire protocol or interfaces
shared with `pyobs-core`, not this repo alone. Those still live in
`pyobs-core/specs/` (tagged with a `Repos:` line naming this repo), per
`pyobs-core/CLAUDE.md`'s "Cross-repo docs" section — don't duplicate them here,
link to them instead:

- `pyobs-core/specs/design/pyobs_2_0_wire_protocol.md` — the wire protocol this
  client's `useXmpp.ts`/`pyobs-codec.ts` implement.
- `pyobs-core/specs/plans/pyobs_2_0_work_plan.md` — the 2.0 migration plan this
  client's own pre-`specs/` history (see the note above) responds to.
- `pyobs-core/specs/steering/pyobs-project-tiers.md`,
  `connected-projects-version-policy.md`, `fleet-tooling-consistency.md` —
  fleet-wide conventions this repo falls under.
- `pyobs-core/specs/steering/fleet-open-items.md` — standing snapshot of open
  issues and plans across the fleet; this repo's open plans are listed there.

If a doc concerns both repos going forward, default to putting it in
`pyobs-core/specs/` with a `Repos:` line (matching existing convention) unless
it's overwhelmingly about this client's own implementation, in which case it
belongs here instead with a `Repos: pyobs-core, pyobs-web-client` line if
`pyobs-core` behavior is also implicated.
