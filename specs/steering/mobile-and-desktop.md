# Every design must work on mobile *and* desktop

Applies to every page/feature in this app, past and future — not something to
weigh per-feature, a blanket bar every layout must clear.

Precedent already shipped in `ShellView.vue`'s console rework: button chips
instead of dropdowns (real tap targets), bounded/scrollable panels for long
lists instead of letting them push other controls off-screen, stacked (not
side-by-side) inputs on narrow viewports, verified with an actual
mobile-viewport (390×844) screenshot pass, not just desktop.

`specs/plans/2026-08-03-camera-page.md` (image sizing) and `specs/plans/2026-08-03-telescope-page.md`
(coordinate-form stacking) were the plans that first exercised this bar — both now done and
live-verified, mobile risk resolved. `specs/plans/2026-09-06-mobile-first-redesign.md` (in
progress) is the currently-open plan most directly about this constraint — it's the breakpoint-
adaptive shell this bar has been building toward. `specs/plans/2026-08-03-idatasequence.md` also
carries an explicit but unverified mobile note (count/delay input layout). Apply the same bar to
any new plan added after this note too — call out the specific mobile risk in the plan itself,
don't just assume it'll be fine.
