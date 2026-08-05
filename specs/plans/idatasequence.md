# Plan: `IDataSequence` support — "grab N images"

Status: proposed, not yet designed in detail. Depends on
`specs/plans/camera-page.md` shipping first (single-shot `grab_data()` +
FITS decode/render pipeline) — this plan only adds the counted-sequence
mechanic on top of that already-working display path, not a second one.

Repos: pyobs-web-client (all implementation here)

Supersedes the "`IDataSequence`" Todo item in `DEVELOPMENT.md`, and the
explicit deferral in `specs/plans/camera-page.md`'s Scope section.

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
  sequence, to fetch and display it?** `DataSequenceState` only reports counts
  and time, not a path. Options, not yet decided:
  - Subscribe to `NewImageEvent` for the duration of an active sequence only
    (narrower than the general "own-triggered only" decision in the Camera
    page plan, which deferred a *permanent* `NewImageEvent` subscription —
    this would be a temporary, sequence-scoped one instead, arguably a
    different, smaller decision).
  - Poll `count_left` transitions and re-derive/guess a path pattern — fragile,
    probably wrong, not a real option, listed only to rule it out explicitly.
  - Show only the *last* image once `count_left` reaches 0, not each
    intermediate one — simplest, but loses the "watch it happen" value a
    counted sequence mostly exists to provide.
  This needs an answer before implementation — it's the actual hard part of
  this plan, everything else is straightforward composition of the Camera
  page's existing pieces.
- Whether `count`/`delay` need client-side sanity bounds (e.g. a max count) or
  should just pass through whatever the operator types, trusting the module's
  own validation/`ForbiddenError`-via-ACL path to reject anything unreasonable.
- Mobile layout for the count/delay inputs — likely no new risk (same numeric-
  input pattern as everything else), but not explicitly verified yet.
