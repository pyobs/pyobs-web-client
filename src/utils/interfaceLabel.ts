// Derives a sidebar-friendly label from a pyobs interface name, e.g.
// "IRoof" -> "Roof", "IStructuredConfig" -> "Structured Config". Strips the
// leading "I" (pyobs interfaces are all named that way) then splits on
// capital letters. No lookup table — see specs/design/interface-nav-per-module-routes.md.
export function interfaceLabel(interfaceName: string): string {
  const withoutPrefix = interfaceName.startsWith('I') ? interfaceName.slice(1) : interfaceName
  return withoutPrefix.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}
