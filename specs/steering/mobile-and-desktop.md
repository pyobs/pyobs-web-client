# Every design must work on mobile *and* desktop

Applies to every page/feature in this app, past and future — not something to
weigh per-feature, a blanket bar every layout must clear.

Precedent already shipped in `ShellView.vue`'s console rework: button chips
instead of dropdowns (real tap targets), bounded/scrollable panels for long
lists instead of letting them push other controls off-screen, stacked (not
side-by-side) inputs on narrow viewports, verified with an actual
mobile-viewport (390×844) screenshot pass, not just desktop.

`specs/plans/camera-page.md` (image sizing) and `specs/plans/telescope-page.md`
(coordinate-form stacking) are the two currently-open plans with real
mobile-layout risk, annotated inline in each. Apply the same bar to any new
plan added after this note too — call out the specific mobile risk in the
plan itself, don't just assume it'll be fine.
