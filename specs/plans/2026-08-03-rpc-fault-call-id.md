# Plan: surface `call_id` on RPC faults

Status: proposed, small — no design questions, just not implemented yet
because nothing currently consumes it.

Repos: pyobs-web-client (all implementation here)

Supersedes the exception-registry/`call_id` note added to
`DEVELOPMENT.md`'s ACL Todo entry.

## Background

`../pyobs-core`'s exception-handling rewrite (see
`../pyobs-core/docs/source/whatsnew-2.0.rst`, "Exception handling") gives
every RPC-exposed method raising a domain exception a correlation id: the
module-side log line includes `(call_id=...)`, and the caller's exception
carries the same id as `exception.call_id` — confirmed on the wire side in
`../pyobs-core/pyobs/comm/xmpp/rpc.py:190-192` (the id is XEP-0009's own
per-call `iq["id"]`, reused rather than inventing a new one) and
`rpc.py:306-308` (`setattr(exception, "call_id", jid)` on the caller-decoded
fault). It exists specifically so an operator debugging a caller-side error
can jump straight to the matching detailed log line on the module that
actually raised it.

This client's `findRpcFault` (`useXmpp.ts:271-282`) only reads `exception`/
`message` off the fault XML — the fault's own IQ `id` attribute (same value)
is available on the parent stanza but never propagated into `RpcResult`.

## Why this isn't needed today

No current UI in this client shows raw fault details to an operator beyond
the plain error message (`ShellView.vue`'s log, `RoofView.vue`'s inline error
alert, etc.) — there's no view where "jump to the matching server log line"
would currently be actionable, since none of them display a call id an
operator could go search a log for. Adding the field without a consumer would
be exactly the kind of speculative plumbing this project's stated preference
against premature abstraction and half-finished implementations warns off.

## Proposed scope, when a consumer exists

- Add `callId?: string` to `RpcResult` (`useXmpp.ts`), populated from the
  fault IQ's own `id` attribute (already available on the `result` element
  `findRpcFault` receives — no new wire parsing needed, just propagate a value
  already in hand).
- Surface it wherever the triggering UI need actually is — most plausibly a
  future "fault detail" panel or expandable row in `ShellView.vue`'s command
  log, showing the call id next to the error message so an operator running
  `pyobsd logs`/`journalctl` against the target module can correlate by id
  rather than by timestamp. Not designing that panel here — this plan is just
  "make the id available," the consuming UI is its own decision when it comes
  up.

## Trigger to revisit

Pick this up when a real debugging-oriented view is proposed (e.g. as part of
a future Shell enhancement) that would actually display the id — not before,
per the "why this isn't needed today" reasoning above.
