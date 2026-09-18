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

## [0.1.0] - 2026-08-04

Initial versioned release.

[0.12.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.12.0
[0.1.0]: https://github.com/pyobs/pyobs-web-client/releases/tag/v0.1.0
