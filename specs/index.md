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

There is no repo-root `DEVELOPMENT.md` anymore — its content is folded into `specs/` (see
`git log -p -- DEVELOPMENT.md` for that file's own history before deletion). What the client does
today, feature by feature, is `design/index.md`'s catalog; what's still open is
`steering/open-items.md`. New proposals/plans going forward belong here in `specs/` directly, not
written inline anywhere else.

## Cross-repo docs

Some design decisions are genuinely about the wire protocol or interfaces
shared with `pyobs-core`, not this repo alone. Those still live in
`pyobs-core/specs/` (tagged with a `Repos:` line naming this repo), per
`pyobs-core/CLAUDE.md`'s "Cross-repo docs" section — don't duplicate them here,
link to them instead:

- `pyobs-core/specs/design/pyobs_2_0_wire_protocol.md` — the wire protocol this
  client's `useXmpp.ts`/`pyobs-codec.ts` implement.
- `pyobs-core/specs/design/mobile-app-and-shared-ts-client-core.md` and ADRs `0016`–`0018` in
  `pyobs-core/specs/adrs/` — the original mobile-app plan (separate React Native app + shared
  TypeScript core), issue pyobs/pyobs-core#884. **Superseded**: replaced by
  `specs/design/native-app-shell-capacitor.md` in this repo, which packages this app itself via
  Capacitor instead of building a second one. Kept in `pyobs-core` as the historical record of the
  transport/framework comparison.
- `pyobs-core/specs/steering/rpc-timeout-command-idempotency.md` — cross-client contract for
  handling an ambiguous RPC outcome (timeout/dropped connection) against physical hardware; this
  client follows it like `pyobs-gui`/`pyobs-polaris` do, not a rule of its own.
- `pyobs-core/specs/plans/pyobs_2_0_work_plan.md` — the 2.0 migration plan this
  client's own `specs/design/pyobs-2-0-wire-protocol-client.md` responds to.
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
