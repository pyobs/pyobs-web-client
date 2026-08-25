# ACL denial — reactive error handling needs no client change

Status: implemented, closed.

pyobs-core 2.0 ACLs (`acl:` config block) are enforced server-side today
(`0d1c9929`, "Implement access control (ACLs) for module RPC calls"). This doc records what that
means for this client's *reactive* path — what happens when a denied call is actually attempted —
as distinct from the *proactive* half (greying out methods before they're tried), which is
`specs/plans/acl-aware-shell-forms.md`.

## Finding

Re-checked against `develop` past `0d1c9929`, up to `ef466ebe` / `v2.0.0.dev53`: `ForbiddenError`
is special-cased in `pyobs/comm/xmpp/rpc.py:239-241` and sent via
`self._client.plugin["xep_0009"].forbidden(iq).send()` — a real XMPP IQ-level `forbidden`
condition, **not** routed through `fault_to_xml` like every other exception.

On the wire this is indistinguishable from any other XMPP-level IQ error (`item-not-found`, etc.)
and is caught by `executeMethod`'s generic `try`/`catch` around `sendIQ`
(`src/composables/useXmpp.ts:314-323`, the `// XMPP-level error (item-not-found, forbidden, …)`
branch) — **not** `findRpcFault`. It never reaches `findRpcFault`, so no `errorClass` is set on
this path; the caller just gets a plain error message.

## Outcome

**No client change needed** — the message renders correctly either way. But if future work ever
wants to distinguish "denied by ACL" from other XMPP-level errors (e.g. to style it differently,
or to cross-check it against `get_permitted_methods()`), it has to branch on this catch block, not
on `errorClass`/`findRpcFault` — those only ever see faults that went through the normal
`fault_to_xml` path, which ACL denials deliberately don't.

This is the third, corrected version of this finding — two earlier notes in `DEVELOPMENT.md`
claimed different (incorrect) mechanics before this one was checked directly against `develop`;
this doc supersedes both.
