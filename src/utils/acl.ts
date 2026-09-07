// Proactive ACL gating for fixed-method buttons (Roof/Telescope/Camera/etc.) —
// see specs/plans/2026-08-03-acl-aware-shell-forms.md. `permittedMethods` is
// PyobsModule's own field: undefined until IModule.get_permitted_methods()
// resolves (or if it never will — an old module, or the call failed), a real
// array once it does. Undetermined and "fetched, empty" are genuinely
// different states and must not collapse to the same default: undetermined
// fails open (show as permitted, matching today's reactive-only behavior);
// a successfully-fetched empty list means the server said no.
//
// pyobs-core method names are unique per module regardless of how many
// interfaces mention one (Module._get_interfaces_and_methods keys its one
// dispatch table by bare method name — a same-named method declared on two
// interfaces the module implements collapses to a single handler, so there's
// never a real ambiguity to resolve here, just one flat name to check).
//
// Deliberately can't distinguish "genuinely unrestricted" from "restricted
// but acl.mode: log" — get_permitted_methods() returns every method name in
// both cases (mode is never published anywhere on the wire) — so both render
// identically (nothing greyed out), matching what would actually happen if
// the operator clicked it.
export function isMethodPermitted(permittedMethods: readonly string[] | undefined, methodName: string): boolean {
  if (permittedMethods === undefined) return true
  return permittedMethods.includes(methodName)
}

// For a control that fires more than one RPC as one logical action (e.g. a
// batch of settings applied before a grab) — permitted only if every method
// in the batch is, so a partial batch never fires and fails partway through
// on one forbidden call.
export function allMethodsPermitted(permittedMethods: readonly string[] | undefined, methodNames: string[]): boolean {
  return methodNames.every((name) => isMethodPermitted(permittedMethods, name))
}

export const NOT_PERMITTED_TITLE = 'Not permitted for this connection'
