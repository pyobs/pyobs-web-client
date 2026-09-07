# Plans

Implementation plans, checklist-style.

- [2026-08-03-acquisition-widget.md](2026-08-03-acquisition-widget.md) — `IAcquisition` widget. **done**
- [2026-08-03-autofocus-widget.md](2026-08-03-autofocus-widget.md) — `IAutoFocus` widget. **done**
- [2026-08-03-autoguiding-widget.md](2026-08-03-autoguiding-widget.md) — `IAutoGuiding` widget. **implemented**
- [2026-08-03-camera-page.md](2026-08-03-camera-page.md) — camera page, grab & display images from `ICamera` modules.
  **done**
- [2026-08-03-events-page-send-tool.md](2026-08-03-events-page-send-tool.md) — send event tool. **done**
- [2026-08-03-mode-widget.md](2026-08-03-mode-widget.md) — `IMode` widget. **done**
- [2026-08-03-weather-widget.md](2026-08-03-weather-widget.md) — `IWeather` widget. **done**
- [2026-09-06-module-page-rework.md](2026-09-06-module-page-rework.md) — one nav destination per module (tabs per
  interface, shared section across tabs), mirroring pyobs-gui's own `ModulePage` redesign; replaces
  today's 7 separate per-interface routes. **done**
- [2026-08-03-telescope-page.md](2026-08-03-telescope-page.md) — telescope page for `ITelescope` modules, incl.
  non-sidereal tracking. **done**
- [2026-08-04-vfs-token-auth.md](2026-08-04-vfs-token-auth.md) — VFS endpoint auth (Basic Auth → Bearer token),
  plus secure-storage-backing the token. **done**

## Not finished

- [2026-08-03-acl-aware-shell-forms.md](2026-08-03-acl-aware-shell-forms.md) — proactive per-method ACL
  gating, project-wide (not Shell itself, which stays ungated). **in progress** — infrastructure done,
  applied to Roof/Telescope; Camera/Mode/AutoFocus/AutoGuiding/Acquisition still pending
- [2026-08-04-auxiliary-interface-widgets.md](2026-08-04-auxiliary-interface-widgets.md) — auxiliary interface widgets
  (attach-or-standalone). **proposed**
- [2026-08-03-idatasequence.md](2026-08-03-idatasequence.md) — `IDataSequence` support ("grab N images"). **proposed**
- [2026-08-03-rpc-fault-call-id.md](2026-08-03-rpc-fault-call-id.md) — surface `call_id` on RPC faults. **proposed**
- [2026-08-03-struct-typed-command-params.md](2026-08-03-struct-typed-command-params.md) — `struct<Name>`-typed command
  params. **blocked on upstream**
- [2026-09-06-mobile-first-redesign.md](2026-09-06-mobile-first-redesign.md) — mobile-first app shell + per-view
  redesign, breakpoint-adaptive (compact nav vs. existing sidebar). **in progress** (Phase 1 done;
  Dashboard + Connections/Login + the ModulePage drill-down migrated; per-widget compact visual
  passes still outstanding)
