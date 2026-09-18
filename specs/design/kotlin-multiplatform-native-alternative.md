# Kotlin Multiplatform as an alternative to the Capacitor shell

Status: **not proposed, not started** — a considered option to keep revisiting, written up so the
tradeoffs and revisit triggers aren't re-derived from scratch each time. No decision made here, no
work planned.

## Goal (if pursued)

Replace the Capacitor WebView shell (`native-app-shell-capacitor.md`) with genuinely native UI on
Android, iOS, Windows, and Linux, built with Kotlin Multiplatform (KMP) + Compose Multiplatform,
sharing one `commonMain` implementation of the protocol layer (XMPP stanzas, XEP-0009 RPC, PubSub —
today's `pyobs-codec.ts`/`useXmpp.ts` in TypeScript) across all four targets. The browser stays Vue/TS
either way — Compose's web target isn't part of this (see "Why not web too").

## Why this keeps coming up

Two things converged in a 2026-09-14 conversation that this doc exists to capture:

1. This app already targets more than the browser (Android/iOS via Capacitor), so "what's the best
   multi-target basis" is a live question, not hypothetical — the earlier framing (`native-app-shell-
   capacitor.md`'s "Why not the earlier plan") answered it once for a from-scratch rewrite in
   TypeScript (React Native + `pyobs-js-core`) and picked "wrap the existing Vue app" instead. KMP is
   the same shape of question asked again, in Kotlin, with better tooling maturity than it had when
   RN/TS-core was evaluated.
2. There was, at the very start of this project, a separate conversation about native Windows/Linux
   apps — not written up anywhere in this repo's specs. That's the desktop gap Capacitor doesn't
   address (it's Android/iOS-only). This doc is partly a record that that gap exists and KMP/Compose
   Desktop is one way to close it, pending whoever has that earlier conversation's context filling in
   what was actually concluded there.

## Why not the earlier plan, again

Same objection `native-app-shell-capacitor.md` raised against RN/`pyobs-js-core` applies here at
full force, not reduced: this is a **full protocol-layer reimplementation** (hand-rolled XMPP
stanzas, XEP-0009 RPC, PubSub — all of it, in Kotlin instead of TypeScript) plus a second, parallel
UI codebase (Compose next to Vue, not replacing it, since web stays Vue). Capacitor got Android/iOS
packaging, secure storage, push, and an offline start screen with **zero** duplication — same
`dist/` build, same `pyobs-codec.ts`. KMP would trade that for genuine native widgets on four
platforms at the cost of maintaining two implementations of everything from the wire protocol up.
That's a real cost, not a rounding error, and it's the reason this stays a "keep considering," not
a plan.

## Platform maturity (checked 2026-09-14 — re-verify before relying on this, it moves fast)

- **Android**: mature — it's the Jetpack-recommended toolkit.
- **iOS**: stable since Compose Multiplatform 1.8.0 (May 2025).
- **Desktop (JVM — covers Windows and Linux)**: mature, production-used for years (e.g. JetBrains
  Toolbox).
- **Web (Wasm)**: Beta since Compose Multiplatform 1.9.0 (Sept 2025); still Beta as of 1.12.0 (Aug
  2026); Kotlin Toolchain 0.12 (Sept 2026) added Wasm *app* build support, but as a preview only.
  KMP's own code-sharing mechanism (`commonMain`/expect-actual) has been stable since 2023 — that
  part was never the risk, Compose's per-target UI maturity is.

Sources: [Compose Multiplatform 1.8.0 — iOS stable](https://blog.jetbrains.com/kotlin/2025/05/compose-multiplatform-1-8-0-released-compose-multiplatform-for-ios-is-stable-and-production-ready/),
[Compose Multiplatform 1.9.0 — Web Beta](https://blog.jetbrains.com/kotlin/2025/09/compose-multiplatform-1-9-0-compose-for-web-beta/),
[Compose Multiplatform 1.12.0](https://blog.jetbrains.com/kotlin/2026/08/compose-multiplatform-1-12-0/),
[Kotlin Toolchain 0.12](https://blog.jetbrains.com/kotlin/2026/09/kotlin-toolchain-0-12-multiplatform-library-publishing-wasm-apps-and-more/),
[KMP stable (2023)](https://blog.jetbrains.com/kotlin/2023/11/kotlin-multiplatform-stable/).

## Why not web too

Compose for Web is the one target still short of stable. Even once it is, adopting it would mean
either porting the existing Vue app to Compose HTML/Wasm (a rewrite of the browser client too, on
top of everything else here) or keeping Vue for web and Compose for native — which is what this doc
already proposes, so there's no version of this plan where the browser target benefits from KMP in
the near term. Track Compose Web's stabilization for its own sake, not as a reason to act sooner
here.

## Revisit triggers

Any of these is reason to actually scope this properly, not just note it:

- **WebView native-feel becomes a real problem** — Capacitor's own open question (native scroll
  physics, native form controls, interruptible swipe-back gestures) turns from hypothetical into an
  actual recurring complaint from daily use.
- **Compose Web reaches stable** — removes the "browser stays Vue forever" split and makes a genuine
  single-codebase pitch possible; worth re-costing the whole tradeoff at that point, not just
  updating the maturity table above.
- **A dedicated native desktop app becomes a hard requirement** — someone explicitly needs
  Windows/Linux without a browser/WebView, not "would be nice." (This is the gap the unrecorded
  early-project conversation raised; if that requirement was already firm, this doc should be
  updated to say so and stop hedging on it.)

## Non-goals (for now)

- No work is planned. This is a written-down option, not a plan — no phasing, no repo restructuring.
- Not a plan to touch the browser target — Vue/TS stays as-is regardless of what happens here (see
  "Why not web too").
- Not a decision that Capacitor was the wrong call — it shipped real value (Credential storage, Push
  notifications, Saved connections in `native-app-shell-capacitor.md`) with zero protocol
  duplication; this doc doesn't relitigate that, it names what would justify moving past it.

## References

- `native-app-shell-capacitor.md` — the shipped alternative this doc is weighed against; its "Open
  questions" section (WebView feel, still open) is the main trigger tracked here too.
- `pyobs-core/specs/design/mobile-app-and-shared-ts-client-core.md` and
  `pyobs-core/specs/adrs/0016`–`0018` (superseded) — the earlier RN/shared-TS-core plan; the
  objection that killed it (protocol-layer duplication, new repos) is the same one this doc weighs
  against KMP, just not automatically fatal here given better platform maturity.
- pyobs/pyobs-core issue #884 — original multi-platform discussion thread.
