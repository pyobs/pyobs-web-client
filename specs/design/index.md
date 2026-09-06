# Design docs

Living architecture/design docs, one per feature or subsystem. Kept around after landing
(`status: implemented`), not deleted.

- [dashboard-expandable-list.md](dashboard-expandable-list.md) — dashboard expandable module list
  instead of a card grid. *implemented, closed*
- [events-page.md](events-page.md) — generic Events page (all event types, not just `LogEvent`).
  *implemented, closed*
- [events-page-send-tool.md](events-page-send-tool.md) — send event tool. *implemented, closed*
- [interface-nav-per-module-routes.md](interface-nav-per-module-routes.md) — interface nav sections
  with per-module routes (Camera, Mode, Roof, ...). *implemented*
- [login-memory-and-vfs-config.md](login-memory-and-vfs-config.md) — remember previous logins +
  per-connection config (VFS endpoints). *implemented, closed* (partially stale)
- [per-domain-websocket-config.md](per-domain-websocket-config.md) — per-domain WebSocket endpoint
  config (one install, many servers). *implemented, closed*
- [roof-page.md](roof-page.md) — roof page status + Open/Close/Stop for `IRoof` modules.
  *implemented, closed*
- [pyobs-2-0-wire-protocol-client.md](pyobs-2-0-wire-protocol-client.md) — this client's own
  implementation of the pyobs-core 2.0 wire protocol (codec, `useXmpp.ts`, generic
  capability/state rendering). *implemented, closed*
- [acl-reactive-error-handling.md](acl-reactive-error-handling.md) — ACL denial reaches the client
  as a plain XMPP-level IQ error, not through `findRpcFault`; no client change needed today.
  *implemented, closed*
- [native-app-shell-capacitor.md](native-app-shell-capacitor.md) — package this app as an
  installable Android/iOS shell via Capacitor (icon, secure credential storage, push, offline
  saved-connections screen), replacing the earlier React Native + shared-core plan. *in progress*
  — icon/credential-storage/saved-connections done (VFS credentials still unmigrated), push not
  started; forward UI evolution tracked in `specs/plans/mobile-first-redesign.md` (issue #884;
  Repos: pyobs-core (superseded ADRs 0016–0018 + design doc), pyobs-web-client)
