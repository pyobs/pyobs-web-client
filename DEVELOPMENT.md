# Adapting to pyobs-core 2.0

`pyobs-web-client` re-implements the pyobs XMPP wire protocol by hand in
`src/composables/useXmpp.ts` (raw Strophe.js stanzas: disco#info, XEP-0009 RPC,
PubSub). pyobs-core 2.0 changed that protocol in breaking ways — this doc originally
tracked that investigation and implementation live; it's now condensed to current
state plus what's still open. The full research/decision trail (codegen-vs-live-schema,
the pause for upstream changes, bug hunts) is in git history — see the note at the
bottom.

## Status: done

The client speaks pyobs-core 2.0's wire protocol natively, with no build-time
codegen — everything is discovered live from each module's own disco#info response:

- **`src/pyobs-codec.ts`**: generic value↔XML codec for `urn:pyobs:rpc:1` (schema-less
  decode, schema-driven encode) plus parsers for the `<pyobs:interface>`/`<{ns}event>`
  disco#info schema blocks. See the file's own header comments for the wire vocabulary.
- **`src/composables/useXmpp.ts`**: `fetchModuleInfo` parses live interface/event
  schemas and capabilities from one disco#info query per module; `executeMethod` builds
  RPC calls from a module's own fetched command schema; `subscribeState` is a
  ref-counted PubSub state subscription; presence drives module online/offline, with
  `probeRosterPresence()` sending directed presence probes to every roster contact
  right after connecting so already-online modules are discovered even if the server
  doesn't auto-probe on initial presence.
- **`ShellView.vue`**: a pyobs-gui-style console — a log of executed commands/replies
  on top, and a command builder below it that shows only one of module/method/params
  at a time (accordion-style: picking a value collapses that layer into a tappable
  one-line summary and advances to the next). RPC forms are built from live command
  schemas — scalar, `datetime`, and `enum(Name)` (rendered as a populated `<select>`)
  params all work, optional-vs-required defaults are handled correctly, and clicking
  Execute fully resets the builder back to the module picker.
- **`DashboardView.vue`** / **`ModuleStateCard.vue`** / **`KeyValueCard.vue`**: generic
  capability/state rendering, no per-interface hardcoding.
- **`LoggingView.vue`**: live `LogEvent`s via versioned event PubSub nodes.
- No generated files, no local `../pyobs-core` checkout dependency — `generate-interfaces.{py,sh}`
  and `pyobs-interfaces.ts` were deleted along with the npm script.

Tested and verified:

- Unit tests (`npm run test:unit`, Vitest + jsdom) cover the codec: scalar/list/dict/
  dataclass decode, encode round-trip (including int32-vs-float64 disambiguation by
  declared type), schema parsing.
- E2e tests (`npm run test:e2e`, Playwright, `e2e/`) drive the real app against a live
  ejabberd server + real pyobs-core modules — no mocked backend.
- Manually verified live against `admin@localhost` with a real `camera` module: Shell
  RPC calls (success + fault paths, enum dropdowns), Dashboard capability/state cards
  (including nested/list/dict shapes), Logging events, and presence-probe-on-connect
  (roster query returns module accounts, directed probes populate the Dashboard on a
  fresh session).

## Standing constraint: every design must work on mobile *and* desktop

Applies to all proposals below (and anything future) — not something to weigh
per-feature, a blanket bar every layout must clear. Precedent already shipped in
`ShellView.vue`'s console rework: button chips instead of dropdowns (real tap
targets), bounded/scrollable panels for long lists instead of letting them push
other controls off-screen, stacked (not side-by-side) inputs on narrow viewports,
verified with an actual mobile-viewport (390×844) screenshot pass, not just desktop.
The two proposals below with real mobile-layout risk are annotated inline
(Camera page's image sizing, Telescope page's coordinate-form stacking); apply the
same bar to any new proposal added after this note too.

## Implemented: remember previous logins + per-connection config (VFS endpoints)

**Done, verified live and via unit tests.** Built per the design below, with one
correction after live testing: `useXmpp.ts` gained a `localStorage`-backed
`recentLogins` list (JIDs only, capped at 10, moved-to-front on successful connect).
First surfaced in `LoginView.vue` via a native `<datalist>` on the JID input — live
testing showed this wasn't reliably visible (no dropdown appeared on click in a real
browser check, not just a screenshot artifact), so it was replaced with an explicit
"Recent logins" row of clickable button chips above the JID field, matching this
app's existing buttons-over-hidden-native-widgets convention (same reasoning as
Shell's module/method chips). New `src/composables/useVfsConfig.ts` holds the
per-bare-JID `vfsEndpoints` store (`localStorage`, `HttpFile`-shaped only) with
`resolveVfsPath()` and add/update/remove CRUD, and a new `SettingsView.vue` (routed
at `/settings`, sidebar entry added) manages endpoints for the current account —
stacked-input form, same styling/mobile pattern as the rest of the app. Unit-tested
in `src/__tests__/useVfsConfig.spec.ts` (44/44 passing, including per-account
isolation and path-resolution edge cases: leading slash, no trailing slash on
`baseUrl`, unknown root, rootless path). Verified live at desktop and mobile
(390×844) viewports: recent-login chips fill the JID field on click, Settings
add/edit/remove all persist correctly and re-populate the form on edit.

Two related but distinct asks: (1) let the user pick a previously-used JID at login
instead of retyping it, and (2) a place to store settings specific to a given pyobs
account/deployment, starting with VFS endpoint definitions — needed to resolve
VFS-style path strings (e.g. `IData.grab_data()`'s return value, or `IVideo`'s
`VideoCapabilities.video`, per `pyobs-core`'s `pyobs/vfs/`) into real fetchable URLs,
which is the prerequisite for ever displaying an image in this client. Actually
rendering an image from a resolved URL is explicitly **not** part of this proposal —
see "Not in scope" below.

### Background: what a VFS path actually is

Checked against `../pyobs-core`'s `pyobs/vfs/vfs.py` and `pyobs/vfs/httpfile.py`, and
`../pyobs-gui`'s `videowidget.py` (the reference client-side consumer): a VFS path
looks like `"pyobs/2024/07/03/image.fits.gz"` — a root name (`"pyobs"`), then a
relative path. Server-side config maps each root name to a backend (`LocalFile`,
`SFTPFile`, `SMBFile`, `HttpFile`, …); a *client* (like `pyobs-gui`, or this web
client) needs its own, independently-configured mapping from root name to something
it can actually reach — for a browser, that can only ever be `HttpFile`'s shape
(`download` base URL, optional `username`/`password` for HTTP Basic Auth). There is
no wire-level way to fetch a client's VFS root config from the server — `pyobs-gui`
gets it from its own local YAML config file; this proposal is this client's
equivalent, stored per-account in the browser instead of a config file.

### 1. Remember previous logins

- New `localStorage` key (persists across browser sessions, unlike today's
  `sessionStorage`-based active-session credentials in `useXmpp.ts`) storing a list of
  previously-used bare JIDs, most-recent-first, capped at a small number (e.g. 10) to
  avoid unbounded growth.
- **JIDs only, never passwords**, in this list. Today's `sessionStorage` password
  persistence is scoped to survive a reload within the same tab/session — a
  materially different trust boundary from `localStorage`, which persists
  indefinitely on disk. Storing passwords there would be a real security regression,
  not just a style choice.
- `connect()`, on success, moves the just-used JID to the front of the list (dedup by
  exact string match).
- `LoginView.vue` renders the list next to/under the JID input (e.g. a native
  `<datalist>` for autocomplete, or a small dropdown of buttons) — picking one fills
  the JID field; password is always typed fresh, every time.
- Signing out does not remove a JID from this list — it's a login-convenience list,
  independent of the active-session marker that already exists today.

### 2. Per-connection config store (VFS endpoints)

- New `localStorage`-backed store, **keyed by bare JID** (per-account, not
  per-domain — see "Open questions"), holding a small settings object. First field:
  `vfsEndpoints: Array<{ root: string; baseUrl: string; username?: string; password?: string }>`
  — mirrors `HttpFile`'s own config shape, since that's the only VFS backend a
  browser can talk to directly.
- New composable (e.g. `useVfsConfig()`) exposing:
  - the current connection's `vfsEndpoints` list (empty until the user defines any).
  - `resolveVfsPath(path: string): string | null` — splits the root off a VFS-style
    path (mirrors `VirtualFileSystem.split_root` in `pyobs-core`), looks up a
    matching endpoint, and returns `baseUrl + rest-of-path`, or `null` if no endpoint
    is configured for that root.
  - CRUD functions to add/edit/remove endpoints, persisted to `localStorage`
    immediately on change.
- New settings page (e.g. `SettingsView.vue`) + sidebar nav entry, where the
  connected user manages VFS endpoints (root name, base URL, optional
  username/password) for the current account — a list of existing endpoints plus a
  small add/edit form, same dark-themed styling as the rest of the app.
- **Storing VFS credentials in `localStorage`, in plaintext, is a real tradeoff**,
  worth naming explicitly: convenient, but readable by anything with access to that
  browser profile. Similar risk class to today's already-`sessionStorage`d XMPP
  password, not a new category of risk — but flagged separately since VFS/archive
  credentials might be higher-privilege or shared across users in some deployments.

### Not in scope for this proposal

- **Actually rendering images.** Resolving a VFS path to a URL is only useful once
  something in the UI (Shell result formatting, or a Dashboard capability card for
  `IVideo`/`IData`-shaped capabilities) recognizes a VFS-path-shaped string and
  renders it as an image instead of raw text. Real, valuable follow-up work, but a
  separate design decision on its own — notably, FITS files (the common case for
  `IData.grab_data()`) aren't natively browser-renderable and would need either
  server-side conversion or a JS FITS-to-canvas decoder, which `IVideo`'s
  browser-friendly preview-image case doesn't need. Not bundled into this proposal.
- **VFS write access** (`HttpFile`'s `upload` side) — nothing in the app performs
  uploads today; only read/`download` matters for the display use case that
  motivated this.

### Decided

- **Config granularity: per-account** (keyed by bare JID), confirmed with the user —
  as reasoned above, different users of the same deployment may hold different HTTP
  Basic Auth credentials for the same archive server.
- **Remembered-logins cap: 10**, confirmed with the user.
- **VFS endpoint config: `HttpFile`-shaped only**, confirmed with the user — no
  other backend shapes (`SFTPFile`/`SMBFile`/etc.) supported, since those are
  fundamentally unreachable from a browser anyway.

## Implemented: per-domain WebSocket endpoint config (one install, many servers)

**Done, verified live via a temporary Playwright driver (not committed) and the
existing unit-test setup.** Built per the design below, with the two open questions
resolved as a `forceSecure` checkbox (not a free-text URL) — see "Decided" below.
One real bug found and fixed while wiring the UI to a live domain:
`Strophe.getDomainFromJid('')` throws (empty string is falsy, so its internal
`getBareJidFromJid` returns `null`, then `.indexOf('@')` on `null` throws), which
crashed `LoginView`'s render on every keystroke while the JID field was still empty
— fixed with the same `jid.value ? Strophe.getDomainFromJid(jid.value) : ''` guard
`useVfsConfig.ts` already uses for the identical pattern.

**Revised after initial implementation, per the user:** no collapsible "Advanced"
section after all — the checkbox is always visible, and defaults to **checked**
rather than unchecked. Since the checkbox now shows a checked state before the user
has ever touched it, a `watch(domain, …, { immediate: true })` in `LoginView.vue`
persists an explicit `true` override for any newly-seen domain the moment it's
known (not just on user interaction) — otherwise connecting before ever touching
the checkbox would silently fall back to auto-detection instead of the (checked)
state actually shown. Unchecking persists an explicit `false`, same as before.

Separately, `LoginView.vue`'s inputs are now wrapped in a real
`<form @submit.prevent="handleLogin">` (was a plain `<div>` with a JS-bound button
click) so the browser's own password manager recognizes it as a login form and
offers to save/autofill credentials — raised when asked whether "remembering whole
logins" (JID + password, not just JID) was possible; storing passwords ourselves in
`localStorage` was rejected as a real security regression (see "Remember previous
logins" above), so this delegates credential storage to the browser's own
encrypted store instead. Verified live: it's a real `<form>` element, the `Advanced`
toggle button (now removed) previously didn't trigger a submit, and pressing Enter
in either field submits natively.

**Further revised into a two-step login (JID first, password second)**, per the
user, on the same reasoning: this is the pattern Google/Microsoft's own login pages
use, and it's compatible with password-manager autocomplete/save *if* the username
`<input>` stays mounted across steps (`v-show`, never `v-if`) rather than being
unmounted when the password step appears — password managers correlate the saved
password to that DOM node, not just to whatever was visible at submit time. Still
one `<form>`, one `@submit.prevent="handleLogin"`, submitted once at the end.
- Step 1 (`step === 'jid'`): recent-login chips, the JID input, the `forceSecure`
  checkbox, and a `type="button"` "Continue" (disabled until `jid` is non-empty) —
  advances `step` to `'password'` and focuses the password input. Pressing Enter in
  the JID field does the same via `@keydown.enter.prevent`, rather than relying on
  the browser's inconsistent single-text-field implicit-submit behavior. Clicking a
  recent-login chip (`pickRecentLogin`) fills the JID **and** advances straight to
  the password step itself, per the user — picking a chip is a complete choice of
  account, so it skips the extra "Continue" click a freshly-typed JID still needs.
- Step 2 (`step === 'password'`): a plain-text recap of the chosen JID plus a
  "Change" link (back to step 1, JID preserved), the password input (autofocused
  via a template ref + `nextTick`), and the real `type="submit"` "Connect" button.
- Verified live at both desktop and 390×844 mobile: the JID `<input>` node is
  confirmed still present in the DOM (just hidden) on step 2 with its value
  intact, the WS checkbox and recent-login chips only show on step 1, the password
  field receives focus automatically on entering step 2, and "Change" returns to
  step 1 with the JID preserved. No cross-browser (Firefox/Safari) autofill check
  done yet — only Chromium, per the caveat already raised when this was proposed.

Verified (via a WebSocket-constructor proxy intercepting the URL Strophe actually
opens, since no real server needed to be reachable for this check):
`admin@otherhost` with no override configured → falls through to
`VITE_XMPP_WS_URL` exactly as designed. Also confirmed at both desktop and a
390×844 mobile viewport: the checkbox is disabled until a JID with a parseable
domain is typed, becomes checked and enabled the moment one is, and wraps
correctly on the narrow viewport.

**Real bug found by the user's own local setup, fixed:** this machine's
`.env.local` has `VITE_XMPP_WS_URL=ws://localhost:5281/ws` — a non-default
*port* (`5281`, not `5280`), not just a scheme choice. The first version of
`buildWsUrl` treated *any* stored override (checked or unchecked) as "ignore
`VITE_XMPP_WS_URL` entirely, hardcode port `5280`" — so simply typing
`admin@localhost` (which the pre-checked-by-default watcher immediately persists
an override for) silently broke this machine's working local connection, and
there was no UI-reachable way back to `ws://localhost:5281/ws`, since unchecking
the box still hardcoded port `5280` (`ws://localhost:5280/ws`, still wrong).
Fixed: the override now only flips `ws:`/`wss:` on top of whatever URL would
otherwise be built (`VITE_XMPP_WS_URL` if set, else auto-construction), via a
regex replace on the scheme, instead of replacing the whole URL and hardcoding
the port. Verified against this exact case: `admin@localhost` with the checkbox
at its default (checked) → `wss://localhost:5281/ws` (port preserved); unchecked
→ `ws://localhost:5281/ws`, an exact match for `.env.local`.

### The problem

`buildWsUrl()` (`useXmpp.ts`) has exactly one override point: the `VITE_XMPP_WS_URL`
env var, read once at Vite dev-server/build startup (`.env.local`, gitignored,
machine-local). When set, it **unconditionally** replaces the WS URL for every login
attempt, regardless of the domain in the JID typed in — there's no way to say "use
this override only for `localhost`, auto-construct normally for everything else."

Concretely: a real user hit this trying to log into `admin@monet.saao.ac.za` on a
machine whose `.env.local` had `VITE_XMPP_WS_URL=wss://localhost:5280/ws` set (from
earlier local dev against a self-signed-cert ejabberd, per the existing local-TLS
debugging note) — every connection attempt silently went to `localhost:5280`
instead, failing with Strophe's generic "Connection failed." The ask: **one running
install of the client should be able to reach both a local dev server and a real
remote deployment**, without editing an env file and restarting between them.

The auto-construction fallback (`${proto}://${domain}:5280/ws`, `proto` inferred
from `window.location.protocol`) already varies correctly by domain — the gap is
specifically when a server's actual WS requirements (scheme, port, path) don't
match that inference (e.g. local ejabberd forces `wss://` via a self-signed cert
even though the page itself is served over plain `http://`, so the auto-inferred
`ws://` scheme is wrong for that one server).

### Proposed fix

Replace the single global env-var override with a `localStorage`-backed, per-domain
override list — same architecture already built for VFS endpoints
(`useVfsConfig.ts`), just keyed by **domain**, not bare JID: the WS endpoint is a
property of the *server*, so every user connecting to the same domain wants the
same override, unlike VFS credentials which can legitimately differ per account.

- New composable (e.g. `useServerConfig.ts`): `serverOverrides: Array<{ domain: string; forceSecure: boolean }>`,
  persisted to `localStorage`, with CRUD functions mirroring `useVfsConfig.ts`'s
  shape. **Not a free-text URL field** — `buildWsUrl`'s only actual guess is the
  scheme (`ws` vs `wss`, inferred from `window.location.protocol`); port (`5280`)
  and path (`/ws`) are already-fixed constants, not inferred, and the one real
  failure case on record (self-signed-cert local ejabberd forcing `wss` while the
  page itself is served over plain `http`) is a scheme mismatch, nothing more. A
  checkbox ("use secure WebSocket for this server") covers that with no raw string
  to type or validate.
- `buildWsUrl(domain)` checks this list first (exact domain match) and, if present,
  uses `forceSecure` to pick the scheme instead of the `window.location.protocol`
  inference (port/path unchanged); falls back to `VITE_XMPP_WS_URL` if still set
  (keeps today's simple-deployment/zero-config path working), then the existing
  auto-construction as the final fallback. No behavior change for anyone who never
  configures an override.
- **Must be editable pre-login** — this is the key architectural difference from
  VFS config: `SettingsView.vue` is gated behind `requiresAuth`, but you need to set
  a server override *before* you can ever successfully connect to that server. This
  config has to live on/near `LoginView.vue` itself, not the authenticated Settings
  page.
- Domain is read from whatever's typed into the JID field at connect time
  (`Strophe.getDomainFromJid`), so switching between `admin@localhost` and
  `admin@monet.saao.ac.za` in the same running session, each with its own override
  (or no override, using auto-construction), just works — no restart.

### Not in scope

- Auto-detecting the right WS URL for a server (e.g. probing well-known paths) —
  this is purely manual, user-supplied config, same as VFS endpoints.
- Removing `VITE_XMPP_WS_URL` entirely — kept as a lowest-priority fallback for
  today's simple single-server deployments that already rely on it.
- **Overriding port or path** — no real deployment has needed this yet (see above);
  if one does, it'd need its own follow-up (either extra fields alongside the
  checkbox, or falling back to a free-text override), not assumed here.

### Decided

- **UI placement: always visible on `LoginView.vue`, no collapsible section** —
  editable without being logged in, confirmed with the user (an earlier pass tried
  a collapsible "Advanced" section; the user asked for it to be removed so the
  checkbox is always shown, no extra click needed). Still needs to satisfy the
  standing mobile+desktop constraint like everything else.
- **Override shape: a checkbox, not a free-text `wsUrl` field**, confirmed with the
  user — see the `forceSecure` reasoning above. No validation question to resolve
  since there's no string to validate.
- **Default: checked (force secure)**, confirmed with the user — the checkbox
  starts checked for any domain rather than starting unchecked/auto-detecting.

## Implemented: Dashboard — expandable module list instead of a card grid

**Done, verified live against the real ejabberd server (`admin@localhost`, real
`camera`/`telescope` modules) at both desktop and 390×844 mobile.** Built exactly
per the design below — no deviations. `DashboardView.vue` now renders a
single-column list of rows sorted by `mod.name`, collapsed by default (status dot,
name, JID, chevron only), with a module's interface badges/`ModuleStateCard`s/
`KeyValueCard`s gated behind `v-if="expanded.has(mod.jid)"` and revealed by
clicking anywhere on the row header. "Expand all"/"Collapse all" buttons sit next
to the heading. Confirmed live: both modules start collapsed; expanding `camera`
alone leaves `telescope` collapsed and renders its badges/state cards (`ICooling`,
`IExposure`, etc.) with live values; "Collapse all" hides them again; no console
errors; layout wraps correctly on the narrow viewport (name/JID truncate with
`text-truncate`/`min-width:0` rather than overflowing, chevron pinned via
`flex-shrink-0`). Confirms the subscribe-on-expand/unsubscribe-on-collapse
efficiency side note below, since `ModuleStateCard` mounting/unmounting under the
`v-if` is what drives `useXmpp`'s ref-counted `subscribeState`.

Current `DashboardView.vue` renders a responsive grid (`row g-3`, `col-sm-6 col-lg-4`)
of cards, one per module, each **permanently fully expanded**: interface badges, every
`ModuleStateCard` (one per stateful interface), every `KeyValueCard` (one per
capability set), all rendered at once. Fine for a handful of modules; unmanageable for
a real fleet (10–20+ modules, several stateful interfaces each) — the ask is to make
this scale, "like pyobs-gui."

### Reference: pyobs-gui's `StatusWidget`

Checked `../pyobs-gui/pyobs_gui/statuswidget.py` directly. It's a `QTreeWidget`, one
top-level row per module (name, version, live status), **collapsed by default**.
`itemClicked` toggles `setExpanded` — clicking anywhere on the row, not just its
expand arrow (`_toggle_expanded`, explicit design choice per its own comment).
Expanding a row reveals child rows added lazily in `_add_module_details`: one row
listing all interfaces, one row per interface with capabilities, one row per
stateful interface with a live-updating state label. Rows are kept sorted by module
name on insert (`_insert_module_item`).

### Proposed `DashboardView.vue` change

- Replace the card grid with a single-column vertical list of rows, one per module,
  sorted alphabetically by `mod.name` (matches pyobs-gui's sort-on-insert).
- A local `expanded: Ref<Set<string>>` (of jids) tracks which rows are open, toggled
  by clicking anywhere on the row header (`@click="toggleExpanded(mod.jid)"`) — same
  "whole row is clickable" behavior as pyobs-gui, plus a trailing chevron icon
  (`bi-chevron-down`/`bi-chevron-right`) as the visual affordance.
- **Collapsed row** (default state for every module): status dot, module name, JID
  (muted, smaller), chevron. That's it — matches pyobs-gui's collapsed row showing
  only name/version/status, not the interface list.
- **Expanded row**: reveals, below the header, exactly what today's card already
  shows and in the same order — interface badges, `ModuleStateCard`s,
  `KeyValueCard`s — content and components unchanged, just gated behind
  `v-if="expanded.has(mod.jid)"` instead of always rendered.
- **Efficiency side-effect worth calling out**: `ModuleStateCard` already
  subscribes on mount and unsubscribes on unmount (ref-counted in `useXmpp`'s
  `subscribeState`, per its own header comment). Gating it behind `v-if` on
  `expanded` means a collapsed module holds **zero** live PubSub subscriptions —
  today's always-expanded design subscribes to every stateful interface of every
  module regardless of whether the user is looking at it, which is exactly the kind
  of cost that compounds as the fleet grows. This isn't just visual decluttering;
  it reduces live subscription count proportionally to how many rows are actually
  open.

### Decided

- **Expand/collapse state is ephemeral** — in-memory only, not persisted across a
  reload, confirmed with the user.
- **Add a "collapse all" / "expand all" affordance**, confirmed with the user —
  trivial once the per-row toggle exists (`expanded.value = new Set()` /
  `= new Set(modules.value.map(m => m.jid))`), e.g. a small button pair next to the
  "Dashboard" heading.

### Not in scope

- No change proposed to *what* is shown when expanded — this is purely a
  progressive-disclosure/layout change around the existing card content, not a
  redesign of `ModuleStateCard`/`KeyValueCard` themselves.

## Implemented: Roof page — status + Open/Close/Stop for `IRoof` modules

**Done, verified live against a real `roof@localhost` module** (this ejabberd
instance grew one during this pass — `IConfig:1`, `IFitsHeaderBefore:1`,
`IModule:1`, `IMotion:1`, `IReady:1`, `IRoof:1`). Built exactly per the design
below, with one grounding detail confirmed live rather than assumed: both
`IMotion` and `IRoof` publish identical `init`/`park`/`stop_motion` commands
(same schema-duplication Shell already disambiguates for interfaces like
`grab_data`), so `RoofView.vue` calls them via the module's `IRoof` interface
schema specifically (semantically matches the page), while the status
`ModuleStateCard` subscribes to `IMotion` (confirmed live: `IRoof` publishes no
`<state>` block of its own — own-only extraction, as already documented above —
so `IMotion` is the only place the state actually appears).

New files/changes: `src/views/RoofView.vue`, plus a `/roof` route
(`router/index.ts`) and a "Roof" sidebar entry (`AppLayout.vue`, `bi-house-door`
icon) between Shell and Logging.

Verified live at both desktop and 390×844 mobile: the real roof module starts at
`status: idle`; clicking **Open** calls `init()` and the status card updates via
live PubSub to `status: initializing` within ~2s (no manual refresh); clicking
**Stop** mid-motion calls `stop_motion()` and the status returns to `idle`; all
three buttons correctly disable while any one action is in flight for that
module; no console errors; layout doesn't overflow on the narrow viewport.

### Grounding

Checked `../pyobs-core`'s `pyobs/interfaces/IRoof.py` directly: `IRoof(IMotion)`
adds nothing of its own — no extra methods, no extra state, just a docstring
("The module controls a roof"). All behavior comes from `IMotion` (`init`, `park`,
`stop_motion`, `MotionState { status, devices, time }`) plus `IReady` above it
(`ReadyState`, not used here). Also checked `../pyobs-gui/pyobs_gui/roofwidget.py`
for the reference button mapping, since "open"/"close" aren't `IMotion` method
names on their own: `buttonOpen` → `IMotion.init()`, `buttonClose` →
`IMotion.park()`, `buttonStop` → `IMotion.stop_motion()`; status label is
`MotionState.status`. (pyobs-gui's widget also shows a live azimuth via
`IPointingAltAz`, if the module implements it — not proposed here, see "Not in
scope".)

### Proposed scope

- New page (e.g. `RoofView.vue`) + sidebar nav entry, listing every currently
  online module implementing `IRoof`.
- Per module: a `ModuleStateCard`-style live status readout (reuse the existing
  component/pattern, keyed off the module's own `IMotion` state schema — no new
  state-rendering code needed) plus three buttons — **Open**, **Close**, **Stop**
  — calling `init()`/`park()`/`stop_motion()` respectively via the same
  `executeMethod` path Shell already uses, driven by the module's live command
  schema rather than hardcoded param assumptions (there are none here — all three
  take no required params).
- **Mobile**: same button-chips-plus-card pattern already used throughout this
  app (Dashboard/Shell) — no new layout risk, satisfies the standing mobile+
  desktop constraint by construction rather than needing its own verification
  pass beyond the usual screenshot check.

### Not in scope

- **Azimuth / `IPointingAltAz` display** — pyobs-gui's widget shows this when
  present, but it's an optional bonus on top of a roof, not part of `IRoof`
  itself; already generically available via Dashboard's capability/state cards
  for any module that implements it. Keeps this page's job strictly to "roof
  status + the three motion actions."
- **Per-device stop** — `stop_motion(device: str | None)` accepts an optional
  device name (`MotionState.devices` can list more than one), but no real `IRoof`
  module seen so far exposes more than one device; the Stop button calls
  `stop_motion()` with no argument (stop everything), same as pyobs-gui's own
  `stop_roof()`. Revisit if a multi-device roof module ever surfaces.

## Proposed: Camera page — grab & display images from `ICamera` modules

**Not yet approved for execution — design only, captured here for review.**
Its dependency — `resolveVfsPath()` from "Implemented: remember previous logins +
per-connection config (VFS endpoints)" above — now exists, so this proposal is
unblocked.

### Scope

- New page (e.g. `CameraView.vue`) + sidebar nav entry, listing every currently-online
  module that implements `ICamera` (= `IData` + `IExposure`, confirmed in
  `../pyobs-core`'s `pyobs/interfaces/ICamera.py`).
- Per module: a minimal expose control — an "Expose" button calling `grab_data()`,
  live `IExposure`'s `ExposureState` (`status`/`progress`/`exposure_time_left`) shown
  while exposing (already have a generic state-rendering pattern via
  `ModuleStateCard`, reusable here), then once `grab_data()` returns a VFS path,
  resolve it via `resolveVfsPath()` and fetch/display the resulting image.
- **Deliberately not** a port of pyobs-gui's full `CameraWidget` (windowing, binning,
  gain, filters, cooling, image format/type, etc.) — every one of those controls is
  just an RPC call or param form, which the existing Shell page already handles
  generically. This page's job is specifically "grab an image and see it," not
  duplicate a full camera control panel.
- **Mobile**: the rendered image must scale to the viewport (`max-width:100%` on the
  canvas/img, not a fixed pixel size) rather than overflowing a narrow screen — the
  module list itself is just button chips + a card per module, same pattern as
  Dashboard/Shell, no special risk there. Panning/zooming a full-resolution image on
  a small screen is a real usability question but not a blocker for a first pass —
  a scaled-to-fit static view is enough to start.

### The hard part: FITS isn't browser-native

Checked `../pyobs-gui/pyobs_gui/datadisplaywidget.py`: it displays grabbed images via
`QFitsWidget`, a real FITS viewer — parses the FITS binary format and applies a
display stretch before rendering, not just a generic image tag. Also checked
`../pyobs-core` for any server-side FITS→PNG/thumbnail conversion (`HttpFileCache`,
"preview", "thumbnail") — **none exists**; `grab_data()`'s returned path is the raw
FITS file, unconverted (and per the example paths already seen elsewhere in this doc,
often gzip-compressed, `.fits.gz`). This means the web client genuinely has to parse
and render FITS itself:

- FITS header parsing (fixed 80-char card records, `NAXIS`/`BITPIX`/etc.) and pixel
  data (typically 16-bit int or 32-bit float).
- A display stretch computed client-side from the decoded pixel array — at minimum
  min/max, ideally zscale (the DS9/`QFitsWidget` convention astronomers expect).
- Rasterizing the stretched array to a `<canvas>`.
- Client-side gzip decompression for `.fits.gz` files, since `fetch()` won't
  transparently decompress a `.gz`-suffixed file unless the HTTP server itself sets
  `Content-Encoding: gzip` — server config this client can't rely on.
- Options: hand-roll a minimal parser (the FITS format itself is simple; zscale is a
  small, well-known algorithm), or evaluate an existing JS FITS library (e.g.
  `fits.js`/`js9`) for bundle-size/license fit — not yet evaluated either way.

This is the single biggest unknown/scope item in the whole proposal — module
listing, the expose button, and VFS path resolution are all straightforward
composition of things already built; FITS decode+render is genuinely new,
nontrivial work and deserves its own investigation before implementation starts.

### Not yet decided

- FITS parsing/rendering approach (hand-rolled vs. library).
- Whether to also subscribe to `NewImageEvent` (mirroring pyobs-gui's event-driven
  auto-refresh) so an image taken by *another* client/script also appears here live,
  versus only showing images this page itself triggered via its own Expose button.

## Proposed: Telescope page — for `ITelescope` modules

**Not yet approved for execution — design only, captured here for review.**

### Reference: pyobs-gui's `TelescopeWidget`

Checked `../pyobs-gui/pyobs_gui/telescopewidget.py` (608 lines). It's large: Init/
Park/Stop buttons, a move-to-coordinates form supporting six coordinate systems
(equatorial RA/Dec, horizontal Alt/Az, orbit elements, and three solar/heliographic
systems — HGS, helioprojective radial, helioprojective mu/psi), buttons that resolve
a target *name* into coordinates via external SIMBAD/JPL-Horizons/Horizons lookups, a
small N/S/E/W directional-button offset widget (`compassmovewidget.py` — simpler than
its name suggests, just four buttons, not a click-anywhere compass), and live RA/Dec
+ Alt/Az + offset state. It also folds in `IFilters`/`IFocuser`/`ITemperatures`
sub-widgets, which this client already covers generically via Shell/Dashboard.

### Proposed scope for a first pass

Same "scope down to the device-specific core, leave generic RPCs to Shell" call as
the Camera-page proposal above:

- New page (e.g. `TelescopeView.vue`) + sidebar nav entry, listing every online
  module implementing `ITelescope` (= `IMotion`, confirmed in
  `pyobs/interfaces/ITelescope.py`).
- Per module: Init / Park / Stop buttons + live `MotionState` (status, per-device
  status list) via the existing generic-state pattern (`ModuleStateCard`).
- If the module also implements `IPointingRaDec` and/or `IPointingAltAz`: a
  move-to-coordinates form (RA/Dec and/or Alt/Az number inputs + a Move button
  calling `move_radec`/`move_altaz`) + live `RaDecState`/`AltAzState` position
  display — show whichever the module actually implements, same
  implements-it-or-not pattern the Camera page proposal already uses for optional
  interfaces.
- If the module also implements `IOffsetsRaDec`/`IOffsetsAltAz`: plain numeric
  offset inputs (+ live offset state) — not the N/S/E/W button widget (see below).
- **Mobile**: if a module implements both `IPointingRaDec` and `IPointingAltAz`,
  the two coordinate-move forms must stack vertically on a narrow viewport rather
  than sitting side by side — same `col-sm-*`-stacks-on-phones convention already
  used elsewhere in this app, not a new pattern to invent. Number inputs for
  RA/Dec/Alt/Az/offsets follow Shell's existing stacked label-then-input param
  styling, which is already mobile-sized.

### Deliberately not in scope for a first pass

- **Target-name resolution** (SIMBAD / JPL Horizons / generic Horizons queries) —
  these hit external astronomy services directly from the GUI process; replicating
  that here means either calling the same external APIs from the browser
  (CORS/rate-limit behavior not evaluated) or via some other proxy. A separate
  decision, not assumed as part of this page.
- **Solar/heliographic coordinate systems** (`IPointingHGS`,
  `IPointingHelioprojective`) — niche (solar telescopes only); no module
  implementing either has been seen in this session's live testing. Can be added
  later following the same pattern as RA/Dec and Alt/Az if a real module needs it.
- **Orbit-elements tracking** — not backed by any interface found in
  `pyobs/interfaces/`; `TelescopeWidget`'s orbit-elements handling computes a
  resulting RA/Dec client-side and still calls `move_radec` under the hood. Same
  "not needed until a real module surfaces this" reasoning.
- **The N/S/E/W directional offset widget** — a real, separate small UI component;
  plain numeric offset inputs (the same pattern already used for every other RPC
  param throughout this app) are enough for a first pass.
- `IFilters`/`IFocuser`/`ITemperatures` sub-panels — already generically available
  via Shell (RPC calls) and Dashboard (capability/state cards); not duplicated here.

### Open questions

- Whether Init/Park/Stop deserve dedicated buttons here at all, given Shell can
  already call any `IMotion` RPC generically — leaning yes, since starting/stopping
  a telescope is frequent enough during real operation to deserve one-click access
  without going through Shell's module→method→params flow, but worth confirming
  this small duplication is wanted.
- Whether RA/Dec and Alt/Az sections should render together on one page (whichever
  interfaces a module implements, shown side by side) or as separate tabs/sections
  when a module implements both.

## Todo

Feature proposals queued above (each not yet approved for execution — see its own
section for the full design/reasoning):

- ~~Remember previous logins + per-connection config (VFS endpoints)~~ — **done**,
  see "Implemented: remember previous logins + per-connection config (VFS
  endpoints)" above.
- ~~Per-domain WebSocket endpoint config (one install, many servers)~~ — **done**,
  see "Implemented: per-domain WebSocket endpoint config (one install, many
  servers)" above.
- ~~Dashboard — expandable module list instead of a card grid~~ — **done**, see
  "Implemented: Dashboard — expandable module list instead of a card grid" above.
- ~~Roof page~~ — **done**, see "Implemented: Roof page — status +
  Open/Close/Stop for `IRoof` modules" above.
- **Camera page** — see "Proposed: Camera page — grab & display images from
  `ICamera` modules". Now unblocked (its VFS-resolution dependency is implemented,
  above); FITS parsing/rendering approach (hand-rolled vs. library) still undecided.
- **Telescope page** — see "Proposed: Telescope page — for `ITelescope` modules".
  Two open questions still unresolved: whether dedicated Init/Park/Stop buttons are
  worth duplicating with Shell, and whether RA/Dec + Alt/Az should share one page or
  split into tabs.
- **ACL-aware Shell forms** — now unblocked (`IModule.get_permitted_methods()`
  landed upstream, see the ACL entry below) but not yet designed. Needs its own
  "Proposed" write-up before implementing, per this project's design-first workflow.

Smaller/technical items:

- **`struct<Name>`-typed command params can't be form-built from schema alone.**
  Unlike `enum(Name)`, whose values live in disco#info's `<types>` block, a
  `struct<Name>` param/field only ever gives you the struct's *name* — pyobs-core
  doesn't publish its field list anywhere on the wire. Not an issue today (no real
  command takes a struct/list/dict param), but if one appears, pyobs-core would need
  to publish struct field schemas too before the client could build an input widget
  for it.
- **pyobs-core 2.0 ACLs — now implemented upstream** (`0d1c9929`, "Implement access
  control (ACLs) for module RPC calls"; this item previously said "design only,
  nothing implemented yet" — that's stale, corrected here). Re-checked
  `pyobs/modules/module.py` directly rather than trusting the earlier note:
  - **Reactive handling already works, confirmed, no client change needed — but for
    a different reason than previously written here.** The earlier text claimed
    `executeMethod`'s generic XMPP IQ-level error catch (`useXmpp.ts:289-293`,
    `// XMPP-level error (item-not-found, forbidden, …)`) covers ACL denials. That
    was wrong: `module.py:391-393` raises `exc.ForbiddenError` from inside RPC
    dispatch, and `rpc.py:218-227` catches it and sends it through the *same
    generic fault path* every other exception uses (`fault_to_xml`) — not a
    special XMPP-level "forbidden" stanza. So a denied call surfaces as an
    ordinary RPC fault, `{exception: "ForbiddenError", message: "..."}`, decoded by
    `findRpcFault` (`useXmpp.ts:243`) exactly like the already-tested
    `get_config_value` `ValueError` fault. Still zero client changes needed
    reactively — just corrected *why*.
  - **The proactive half is now unblocked.** `IModule.get_permitted_methods()`
    exists (`pyobs/interfaces/IModule.py:29`, implemented in `module.py:598`) — the
    dependency this item was waiting on has landed. `ShellView.vue`'s RPC forms
    (already built per-module from `fetchModuleInfo`'s live command schema) could
    now call it once per module and grey out/hide methods the connected identity
    isn't permitted to call, instead of only finding out on submit. Not designed
    in detail yet — worth its own "Proposed" write-up (in the style of the other
    proposals above) before implementing, per this project's design-first workflow.

## Full history

The condensed summary above reflects final state; the detailed narrative (why codegen
was dropped, the round where implementation paused pending an upstream pyobs-core
change, the wire-format corrections found while re-verifying against a moving HEAD, the
post-implementation bug hunts) is preserved in git history rather than duplicated here
— see `git log -p -- DEVELOPMENT.md`.
