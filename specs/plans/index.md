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
- [2026-08-03-acl-aware-shell-forms.md](2026-08-03-acl-aware-shell-forms.md) — proactive per-method ACL
  gating, project-wide (not Shell itself, which stays ungated). **done**
- [2026-09-07-widget-visual-redesign.md](2026-09-07-widget-visual-redesign.md) — curated per-interface
  status rows + shared card/button design system for the 7 module widgets, closing out
  mobile-first-redesign's unresolved visual-language gap. **done** 2026-09-08 — landed, then a full
  round of corrections (found by cross-checking against `pyobs-gui` and live-testing) and further
  live-feedback fixes (chart legibility, matching widths, always-visible plots, full-width rows),
  all live-verified; see the plan's own "Corrections" section.
- [2026-08-04-auxiliary-interface-widgets.md](2026-08-04-auxiliary-interface-widgets.md) — auxiliary interface widgets
  (Cooling/Filters/Temperatures/Focuser, `sidebar_preferred`-promoted or demoted to the shared
  section). **done** 2026-09-08 — all four widgets built and registered
- [2026-09-07-video-widget.md](2026-09-07-video-widget.md) — `IVideo` widget (Live View via native
  `<img>` MJPEG, FITS Image grab). **built** 2026-09-08
- [2026-09-07-spectrograph-widget.md](2026-09-07-spectrograph-widget.md) — `ISpectrograph` widget
  (camera-lite: expose/abort/status, no settings panel). **built** 2026-09-08
- [2026-09-07-structured-config-widget.md](2026-09-07-structured-config-widget.md) — `IStructuredConfig`
  widget (schema-driven module config form). **done** 2026-09-08 — all three phases built and live-verified
- [2026-09-07-robotic-widgets.md](2026-09-07-robotic-widgets.md) — `IRobotic` + `IRoboticScheduler`
  widgets (current/next task, countdown, upcoming schedule). **built** 2026-09-08
- [2026-08-03-idatasequence.md](2026-08-03-idatasequence.md) — `IDataSequence` support ("grab N images"). **proposed**
- [2026-08-03-rpc-fault-call-id.md](2026-08-03-rpc-fault-call-id.md) — surface `call_id` on RPC faults. **proposed**
- [2026-08-03-struct-typed-command-params.md](2026-08-03-struct-typed-command-params.md) — `struct<Name>`-typed command
  params. **blocked on upstream**
- [2026-09-09-safe-area-insets.md](2026-09-09-safe-area-insets.md) — status bar / gesture-nav inset
  handling for the compact shell + FAB, split out of mobile-first-redesign Phase 3. **proposed**
- [2026-09-06-mobile-first-redesign.md](2026-09-06-mobile-first-redesign.md) — mobile-first app shell + per-view
  redesign, breakpoint-adaptive (compact nav vs. existing sidebar). **in progress** — Phase 1 done;
  Phase 2 done except `SettingsView` (still unmigrated, no responsive styling); Phases 3-4 not started
