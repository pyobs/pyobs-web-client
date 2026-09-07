# Plan: ACL-aware Shell forms

Status: done. Both open questions below resolved. Infrastructure (`PyobsModule.permittedMethods`,
`fetchModuleInfo`'s `get_permitted_methods()` fetch, `src/utils/acl.ts`) is in and applied to every
control this plan scoped, per the "gate every RPC-triggering control project-wide" resolution below
— **not** Shell itself, which stays the one deliberate exception: `RoofView.vue` (Init/Park/Stop),
`TelescopeView.vue` (Init/Park/Stop, move/offset/tracking commands), `ModeModuleCard.vue` (per-group
mode select), `AutoFocusView.vue`/`AcquisitionView.vue` (Run-or-equivalent/Abort),
`AutoGuidingView.vue` (Start/Stop/Set exposure time), and `CameraView.vue`'s Expose button, gated on
the *whole batch* of settings + `grab_data` RPCs it fires as one unit (per the "Resolved by
pyobs-polaris" section) — permitted only if every method in the batch is.

Live-verified against real ejabberd + `pyobs-core`, three scenarios: `telescope_acl.yaml`'s partial
allow-list (`init`/`move_radec` stayed enabled, `park`/`stop_motion`/Alt-Az/tracking controls
correctly disabled with a "Not permitted for this connection" tooltip); `telescope_acl_denied.yaml`'s
empty allow-list (every control disabled, module still renders normally on Dashboard and its own
page — confirms "grey out, not hide" holds at the module-list level too, not just per-button); and
no ACL configured at all across `roof.yaml`/`mode.yaml`/`autofocus.yaml`/`guiding.yaml`/
`acquisition.yaml`/`camera.yaml` (everything enabled; a real `init()` call on Roof round-tripped
end-to-end via live PubSub). The batch-gating logic specifically was proven with a scratch ACL
config permitting every command `CameraView`'s Expose fires *except* `set_window` — Expose correctly
disabled (with the same tooltip) even though `grab_data` itself and every other settings command
were permitted, confirming a partial-batch denial gates the whole action, not just the denied piece.

Repos: pyobs-web-client (all implementation here); depends on
`IModule.get_permitted_methods()` in `../pyobs-core` (already implemented,
`pyobs/modules/module.py:871`)

Supersedes the "ACL-aware Shell forms" item originally in the (since-deleted) repo-root
`DEVELOPMENT.md`; see `specs/steering/open-items.md`.

## Problem statement

`ShellView.vue`'s RPC forms (built per-module from `fetchModuleInfo`'s live
command schema) let an operator pick any method any connected module exposes,
including ones ACLs (`acl:` config block, `../pyobs-core` 2.0) deny them from
actually calling. Today the only feedback is reactive: submit the call, get a
`ForbiddenError` back after the fact (see `specs/design/acl-reactive-error-handling.md` for the
exact mechanics — it arrives via `executeMethod`'s generic XMPP-level error branch,
`useXmpp.ts:460-468`, not `findRpcFault`). This plan is the proactive half: grey out or hide methods the
connected identity can't call, before it tries.

## What `get_permitted_methods()` actually gives us

Confirmed against `../pyobs-core/pyobs/modules/module.py:871-878`:

```python
async def get_permitted_methods(self, **kwargs: Any) -> list[str]:
    if self._acl_mode == "log":
        return list(self._methods.keys())  # log mode: nothing is actually enforced
    sender = kwargs.get("sender", "")
    return [name for name in self._methods if not self._acl_denied(sender, name)]
```

Key points that shape the design:

- Returns a flat `list[str]` of **method names**, not interface-qualified
  (`self._methods` is keyed by bare RPC method name across all of a module's
  interfaces combined) — the client will need to match these against
  `CommandSchema` entries by name, not by `(interface, method)` pair. Check
  whether method names can collide across two different interfaces on the same
  module before assuming a flat name-set is unambiguous; if pyobs-core allows
  that, this call alone can't disambiguate and the design needs to account for
  it (e.g. treat a returned name as "permitted in at least one interface it
  appears in" rather than definitively per-interface).
- In `mode: log` (a module validating a new ACL policy without enforcing it
  yet), this returns **everything**, indistinguishable from "no ACL configured
  at all." A Shell form has no way to tell "genuinely unrestricted" apart from
  "restricted but only logging" from this call alone — greying out nothing in
  either case is the correct, safe behavior (matches what would actually
  happen if the operator clicked it), just worth stating explicitly so it's
  not mistaken for a bug later.
- Exempt from ACL enforcement itself (a denied caller can still ask what it's
  denied from) — so this call itself never fails with `ForbiddenError`, no
  special-case handling needed for the query itself.
- No caching/TTL semantics documented — assume it should be called once per
  module per Shell session (e.g. on module selection in the builder), not
  polled, unless real usage shows ACLs changing live under a connected
  session (config reload) matters in practice.

## Proposed scope

- On selecting a module in `ShellView.vue`'s builder (`step === 'method'`),
  call `get_permitted_methods()` once and cache the result alongside that
  module's other fetched info.
- Grey out (not hide — an operator should still be able to see a method
  exists, just not click it, consistent with how `RoofView.vue`/Shell already
  disable in-flight buttons rather than removing them) any method name not in
  the returned list, with a tooltip/label indicating why (e.g. "not permitted
  for this connection").
- If `get_permitted_methods()` itself fails (network error, or a module old
  enough not to implement `IModule` at this version) — fail open, i.e. show
  every method as if no ACL info was available, rather than greying out
  everything on an error. Denying by default on a failed proactive check would
  be a worse failure mode than falling back to today's reactive-only behavior.
- No change to the reactive path — a denied call still surfaces as today
  (plain error message via the XMPP-level error branch); this plan only adds
  the proactive greying, doesn't change what happens if a stale/incorrect
  permission list lets a doomed call through anyway.

## Resolved by `pyobs-polaris` precedent: apply this project-wide, not just Shell

`pyobs-polaris` (a sibling client built on the identical wire-protocol/
generic-rendering architecture as this one) implemented the equivalent of
this exact plan (`DEVELOPMENT.md`'s "ACL / permitted-methods gating"
section) and answers what was previously an open question here directly:
**gate every RPC-triggering control project-wide, not only Shell's generic
form builder.** It fetches `get_permitted_methods()` once per module right
after discovery (piggybacked on the same module-info fetch this client's
`fetchModuleInfo` already does, as an independent second RPC round trip —
disco#info and RPC are different wire mechanisms, so this can't be folded
into one request), stores the result as "undefined/nullopt until fetched,
empty-or-populated list once it resolves," and gates *every* button that
triggers an RPC call across every page: Roof's Open/Close/Stop, the
move/offset/compass controls on its Telescope page, Camera's per-control
settings and its Expose button (gated on the *whole batch* of RPCs a single
Expose might trigger — window/gain/exposure-time/grab_data — as one unit,
so a partial batch doesn't fire and fail partway through on one forbidden
call), the Run/Abort or Start/Stop buttons on every one of this batch's new
widgets (AutoFocus/Acquisition/AutoGuiding), Mode's Set button, and any
other fixed-method sidebar control. **`ShellView`'s free-text RPC console
was deliberately left ungated** — it's not a per-known-method button the
way every other page's controls are, and the server enforces the ACL
regardless of what the client preemptively disables; the proactive check is
a UX nicety layered on top of real enforcement, not the enforcement
boundary itself. Adopt the same scope and the same reasoning here: this
plan should ship as one cross-cutting mechanism applied to every
RPC-triggering button in this app (Roof, Telescope, Camera, and the five new
widgets in this batch of plans), with Shell's own free-text builder as the
one deliberate exception.

**Confirmed live** (per `pyobs-polaris`'s own verification): denied vs.
undetermined are genuinely different states, not the same thing —
`get_permitted_methods()` returning a real, successfully-fetched **empty**
list for a denied sender must be treated as "nothing permitted," while a
failed fetch (`undefined`/no value at all) is the only case that means
"fail open, show everything as if unchecked." Don't conflate "we asked and
got told no" with "we never got an answer" — they need opposite defaults.

## Open questions — resolved 2026-09-07

- **Method-name collision across interfaces on one module: not actually possible, confirmed
  against `../pyobs-core/pyobs/modules/module.py`'s `_get_interfaces_and_methods()`.** It builds
  `self._methods` as a single flat `dict[str, ...]`, assigning `self._methods[method_name] = ...`
  once per method name while looping over every interface the module implements — a same-named
  method declared on two interfaces collapses to one dispatch entry (last interface processed
  wins), not two. `execute()` itself dispatches purely off `self._methods[method]`, so there is
  never more than one live handler per method name per module regardless of how many interfaces
  mention it — a flat name-based permitted-methods list is unambiguous by construction, no
  "at least one interface" special-casing needed. `src/utils/acl.ts` documents this inline.
- **Log-mode visual distinction: not pursued, accepting the limitation as originally framed.**
  Confirmed no wire-level signal exists for it — `Module.open()`'s published `ModuleCapabilities`
  (`../pyobs-core/pyobs/modules/module.py:356-361`) carries only `version`/`label`/`location`,
  `_acl_mode` is never published anywhere. `get_permitted_methods()` remains the only signal,
  ambiguous between "genuinely unrestricted" and "log mode" exactly as this doc already described
  — both render as fully enabled, matching what would actually happen if clicked.
