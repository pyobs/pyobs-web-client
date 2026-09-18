# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.0] - 2026-09-18

### Added

- Per-user push notification type preferences: a "Notification types" list in Settings lets an
  account choose which alerts it receives (module errors, error log events, critical log events),
  enforced server-side by `PushNotifier`. Read on connect, written on toggle, all-on by default.
  (#57)

### Changed

- `IPushNotifications` client calls renamed to `register_push_device`,
  `get_push_preferences`, and `set_push_preferences` to match pyobs-core's push-prefixed names.

### Docs

- Documented the release process in `RELEASING.md`.

## [0.11.0] - 2026-09-14

### Added

- `IDataSequence` support (grab N images) and fixed the broken live event subscription that
  silently dropped `NewImageEvent`s.
- `struct<Name>`-typed command params (pyobs-core#898).
- RPC fault `call_id` surfaced in Shell's command log for correlating with server-side logs (#54).
- Connected server label in the app header (#52).

### Changed

- `IVideo` Live View drives the token-protected login flow.
- SettingsView migrated to the shared `.pyobs-card` design system.

### Fixed

- Refused to remember passwords on the plain web build rather than falling back to plaintext (#53).
- Refused to persist VFS bearer tokens on non-native builds.

## [0.10.0] - 2026-09-13

### Added

- Editable linked-apps list with domain-guessed defaults (web-admin/portal/weather) (#48).
- Automatic reconnect on any XMPP connection drop, not just page reload (#49).

## [0.9.0] - 2026-09-09

### Added

- Keyboard-avoidance so focused text/number inputs stay visible above the on-screen keyboard.
- Safe-area inset handling for the compact shell and floating action button.

## [0.8.0] - 2026-09-08

### Added

- Humanized wire parameter names in the generic forms (#44).
- Camera page: binning as a dropdown, a full-frame button, and binning-aware window limits
  (#41, #43).

### Fixed

- Required enum fields are seeded with a real default instead of a dead empty option (#42).
- Dropped the data-type badge from `ParamForm` fields and added number-input limits (#40).
- Auto-reconnect now surfaces an error when both attempts are exhausted (#47).
- Generic example in the connection-label placeholder instead of an internal telescope name (#46).
- Dashboard no longer exits the app on an Android edge-swipe-back (#45).

## [0.7.0] - 2026-09-08

### Added

- Auxiliary module widgets: `ICooling`, Focuser, Filters, Temperatures (attach-or-standalone).
- `ISpectrograph` and `IVideo` (Live View + FITS image grab) widgets.
- `IRobotic` / `IRoboticScheduler` widgets.
- `IStructuredConfig` widget (flat fields in this release).
- Tap-to-arm confirmation for higher-risk action buttons.
- A mobile back button in the compact top bar.
- Per-connection labels and Save / Save-and-connect on the Edit Connection screen.
- Telescope page: independent RA/Dec vs Alt/Az offsets, Simbad lookup, sexagesimal input.

### Changed

- Curated per-interface status displays and a unified button/card styling across module widgets.
- Camera page settings became capability-gated groups rather than one collapse toggle.
- Numbers in the generic state dump are rounded instead of full wire precision.

### Fixed

- Dashboard triage: PARKED/POSITIONED are "resting", not "running".
- `IVideo` distinguishes stream-unavailable causes instead of one generic message.
- Android edge-swipe-back navigates instead of exiting the app.
- Docker image workflow never firing on an automated release.

## [0.6.0] - 2026-09-07

### Added

- Telescope page for `ITelescope` modules (live-verified against a real telescope module).
- Push-notification feasibility spike (end-to-end delivery confirmed).
- Proactive ACL gating for Roof/Telescope and the Mode/AutoFocus/AutoGuiding/Acquisition/Camera
  controls.

### Changed

- VFS endpoint auth moved to a secure-storage-backed Bearer token.

### Fixed

- LoginView's domain watcher no longer pollutes localStorage on every keystroke.

## [0.5.1] - 2026-09-07

### Added

- Docker image build (`Dockerfile` + release workflow).

## [0.5.0] - 2026-09-07

### Added

- Per-domain WebSocket port override.
- ModulePage rework: one nav destination per module (tabs per interface, shared section).

## [0.4.1] - 2026-09-07

### Added

- Android debug APK built and attached to releases automatically.
- Android `versionName`/`versionCode` derived from `package.json`.

## [0.4.0] - 2026-09-06

### Added

- Capacitor Android shell with an offline Connections landing page and opt-in credential storage.
- Redesigned Connections start screen with an Edit-connection screen.
- Compact-shell navigation and a status-triage Dashboard.
- Real app icon and a fix for debug-signing inconsistency between Android Studio and the CLI.

## [0.3.0] - 2026-08-25

### Added

- Camera page: FITS display, grab & display of images, and per-interface settings (#23).
- Sphinx docs site.
- App version shown on the login page.

## [0.2.0] - 2026-08-04

### Added

- First module widgets: `IMode`, `IWeather`, `IAutoFocus`, `IAutoGuiding`, `IAcquisition`.
- Per-module routes for interface nav sections.
- Generic Events page and a role-aware send-event tool.
- App version in the sidebar header.
- CI workflow to build and publish releases on tag push.
- License, changelog, package metadata, and an example nginx deployment config.

### Fixed

- Stale module status when switching between same-interface modules (#15).
- Event Sender showing `pubsub.localhost` on a fresh connect.

## [0.1.0] - 2026-08-04

Initial versioned release.

[0.12.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.12.0
[0.11.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.11.0
[0.10.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.10.0
[0.9.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.9.0
[0.8.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.8.0
[0.7.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.7.0
[0.6.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.6.0
[0.5.1]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.5.1
[0.5.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.5.0
[0.4.1]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.4.1
[0.4.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.4.0
[0.3.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.3.0
[0.2.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.2.0
[0.1.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.1.0
