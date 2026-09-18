# Plan: `IDataSequence` support — "grab N images"

Status: **done**, implemented and live-verified 2026-09-14 against `pyobs-core` 2.8.9
(`testing/.venv`, camera module). Count/delay inputs, `DataSequenceState` progress,
`abort_sequence()`, and per-grab image display all built in `CameraView.vue`. The
per-grab image display needed a separate fix first — the resolved open question below
turned out to rely on a generic event-subscription mechanism that was itself broken
(wrong pubsub host/node id, silently dropping every live event in the app); see
`specs/plans/2026-09-14-event-subscription-shared-pubsub.md` (issue #56). Both smaller
open questions from below are now closed: mobile layout confirmed good (Tim, real-device
check 2026-09-14); client-side sanity bounds on count/delay deliberately left as-is —
the `min` HTML attributes already on those inputs plus the server's own
`InvalidArgumentError` (already surfaced as a visible error) match how every other
numeric input in this app is handled (exposure time, gain, window/binning), no special
case warranted.

Depended on `specs/plans/2026-08-03-camera-page.md` shipping first (single-shot
`grab_data()` + FITS decode/render pipeline) — this plan only added the
counted-sequence mechanic on top of that already-working display path, not a second one.

Repos: pyobs-web-client (all implementation here)

Supersedes the "`IDataSequence`" item originally in the (since-deleted) repo-root
`DEVELOPMENT.md` (see `specs/steering/open-items.md`), and the
explicit deferral in `specs/plans/2026-08-03-camera-page.md`'s Scope section.

## What `IDataSequence` actually provides

Confirmed against `../pyobs-core/docs/source/whatsnew-2.0.rst` ("Counted data
sequences") and `../pyobs-core/pyobs/modules/camera/basecamera.py`
(`BaseCamera.grab_sequence`/`abort_sequence`):

- `grab_sequence(count: int, delay: float = 0)` — fire-and-forget, returns
  immediately; the sequence runs server-side. `delay` is seconds between the
  end of one grab and the start of the next, skipped after the last grab.
- `abort_sequence()` — graceful: lets the current grab finish, stops the rest.
  Distinct from the existing `IAbortable.abort()`, which now also clears a
  running sequence's count (hard-stops the current exposure too).
- `state = DataSequenceState(count_total, count_left, time)` — live progress,
  same PubSub state mechanism the Camera page plan already uses for
  `IExposure`'s `ExposureState`.

Because it's fire-and-forget, there is no single RPC response to await for
"the sequence is done" — progress and completion are only observable via the
pushed state, same as every other live-state interface in this app.

## Proposed scope

- Only for modules that implement `IDataSequence` (in addition to `ICamera`) —
  conditional rendering, same implements-it-or-not pattern used throughout
  this app for optional interfaces.
- A count input (integer, e.g. a bootstrap number input, default 1) + optional
  delay input, alongside the existing single-shot Expose button from the
  Camera page plan — not replacing it; a single-shot `grab_data()` stays the
  default/simple path for the common case, "grab N" is an additional control,
  not a mode switch.
- `ModuleStateCard`-style rendering of `DataSequenceState` (count_total,
  count_left) while a sequence is running — reuse the existing generic
  state-card pattern, no new state-rendering code.
- Abort button, visible only while a sequence is in progress (`count_left >
  0`), calling `abort_sequence()`. Existing single-shot exposures keep using
  whatever abort mechanism the Camera page plan already established
  (`IAbortable.abort()`), unchanged.
- **Each completed grab in the sequence**: reuse the Camera page's existing
  decode/render pipeline per image. Open question below on how the client
  knows a new image is ready per-grab (see "Open questions").

## Open questions

- **How does the client learn a new image is ready after each grab in the
  sequence, to fetch and display it?** — Answered 2026-09-14: **no new
  subscription needed.** `fetchModuleInfo()` (`src/composables/useXmpp.ts:345-370`)
  already subscribes to every event a module declares with `role: 'send'`,
  unconditionally, for every online module in the roster, session-wide —
  triggered from `handlePresence` (line 428), not scoped to any particular
  page being open. `BaseCamera` declares `NewImageEvent`, and `grab_sequence`'s
  internal loop (`../pyobs-core/pyobs/modules/camera/basecamera.py:433-445`)
  just calls `grab_data()` repeatedly, which emits the exact same
  `NewImageEvent` (line 354) a single-shot grab does. So those events are
  already flowing into the shared `events` ref (the same one `EventsView.vue`
  reads) whether or not a sequence is running. This supersedes the Camera
  page plan's "own-triggered only, no `NewImageEvent` subscription" phase-2
  note at the transport level — the subscription already exists generically,
  that decision was only ever about the Camera page choosing not to *consume*
  it for auto-refresh.

  Implementation: while `count_left > 0`, filter the existing `events` array
  for `module === <this camera's name> && type === 'NewImageEvent'`, and feed
  each match into the Camera page's existing decode/render pipeline in arrival
  order. No subscribe/unsubscribe lifecycle to manage.

  Known accepted edge case, not worth building correlation logic for:
  `NewImageEvent` carries no sequence ID, and `grab_sequence`'s inter-image
  `delay` window returns the camera to `ExposureStatus.IDLE` between grabs, so
  another client's own `grab_data()` call during that window would emit an
  indistinguishable stray event. Same single-operator trust assumption this
  app already makes elsewhere (e.g. `specs/design/acl-reactive-error-handling.md`).
- Whether `count`/`delay` need client-side sanity bounds (e.g. a max count) or
  should just pass through whatever the operator types, trusting the module's
  own validation/`ForbiddenError`-via-ACL path to reject anything unreasonable.
- Mobile layout for the count/delay inputs — likely no new risk (same numeric-
  input pattern as everything else), but not explicitly verified yet.
