# Per-domain WebSocket endpoint config (one install, many servers)

Status: implemented, closed.

## The problem

`buildWsUrl()` (`useXmpp.ts`) has exactly one override point: the
`VITE_XMPP_WS_URL` env var, read once at Vite dev-server/build startup
(`.env.local`, gitignored, machine-local). When set, it **unconditionally**
replaces the WS URL for every login attempt, regardless of the domain in the
JID typed in — there's no way to say "use this override only for `localhost`,
auto-construct normally for everything else."

Concretely: a real user hit this trying to log into `admin@monet.saao.ac.za`
on a machine whose `.env.local` had `VITE_XMPP_WS_URL=wss://localhost:5280/ws`
set (from earlier local dev against a self-signed-cert ejabberd, per the
existing local-TLS debugging note) — every connection attempt silently went to
`localhost:5280` instead, failing with Strophe's generic "Connection failed."
The ask: **one running install of the client should be able to reach both a
local dev server and a real remote deployment**, without editing an env file
and restarting between them.

The auto-construction fallback (`${proto}://${domain}:5280/ws`, `proto`
inferred from `window.location.protocol`) already varies correctly by domain —
the gap is specifically when a server's actual WS requirements (scheme, port,
path) don't match that inference (e.g. local ejabberd forces `wss://` via a
self-signed cert even though the page itself is served over plain `http://`,
so the auto-inferred `ws://` scheme is wrong for that one server).

## Design

Replace the single global env-var override with a `localStorage`-backed,
per-domain override list — same architecture as VFS endpoints
(`useVfsConfig.ts`), just keyed by **domain**, not bare JID: the WS endpoint is
a property of the *server*, so every user connecting to the same domain wants
the same override, unlike VFS credentials which can legitimately differ per
account.

- `useServerConfig.ts`: `serverOverrides: Array<{ domain: string; forceSecure: boolean }>`,
  persisted to `localStorage`, with CRUD functions mirroring `useVfsConfig.ts`'s
  shape. **Not a free-text URL field** — `buildWsUrl`'s only actual guess is
  the scheme (`ws` vs `wss`, inferred from `window.location.protocol`); port
  (`5280`) and path (`/ws`) are already-fixed constants, not inferred, and the
  one real failure case on record (self-signed-cert local ejabberd forcing
  `wss` while the page itself is served over plain `http`) is a scheme
  mismatch, nothing more. A checkbox ("use secure WebSocket for this server")
  covers that with no raw string to type or validate.
- `buildWsUrl(domain)` checks this list first (exact domain match) and, if
  present, uses `forceSecure` to pick the scheme instead of the
  `window.location.protocol` inference (port/path unchanged); falls back to
  `VITE_XMPP_WS_URL` if still set (keeps the simple-deployment/zero-config
  path working), then the existing auto-construction as the final fallback.
  No behavior change for anyone who never configures an override.
- **Must be editable pre-login** — the key architectural difference from VFS
  config: `SettingsView.vue` is gated behind `requiresAuth`, but you need to
  set a server override *before* you can ever successfully connect to that
  server. This config lives on/near `LoginView.vue` itself, not the
  authenticated Settings page.
- Domain is read from whatever's typed into the JID field at connect time
  (`Strophe.getDomainFromJid`), so switching between `admin@localhost` and
  `admin@monet.saao.ac.za` in the same running session, each with its own
  override (or no override, using auto-construction), just works — no
  restart.

## Not in scope

- Auto-detecting the right WS URL for a server (e.g. probing well-known
  paths) — this is purely manual, user-supplied config, same as VFS
  endpoints.
- Removing `VITE_XMPP_WS_URL` entirely — kept as a lowest-priority fallback
  for simple single-server deployments that already rely on it.
- **Overriding port or path** — no real deployment has needed this yet; if
  one does, it'd need its own follow-up (either extra fields alongside the
  checkbox, or falling back to a free-text override), not assumed here.

## Decided

- **UI placement: always visible on `LoginView.vue`, no collapsible
  section** — editable without being logged in, confirmed with the user (an
  earlier pass tried a collapsible "Advanced" section; the user asked for it
  to be removed so the checkbox is always shown, no extra click needed).
  Still needs to satisfy `specs/steering/mobile-and-desktop.md` like
  everything else.
- **Override shape: a checkbox, not a free-text `wsUrl` field**, confirmed
  with the user — see the `forceSecure` reasoning above. No validation
  question to resolve since there's no string to validate.
- **Default: checked (force secure)**, confirmed with the user — the
  checkbox starts checked for any domain rather than starting
  unchecked/auto-detecting.

## Implementation notes / bugs found along the way

One real bug found and fixed while wiring the UI to a live domain:
`Strophe.getDomainFromJid('')` throws (empty string is falsy, so its internal
`getBareJidFromJid` returns `null`, then `.indexOf('@')` on `null` throws),
which crashed `LoginView`'s render on every keystroke while the JID field was
still empty — fixed with the same
`jid.value ? Strophe.getDomainFromJid(jid.value) : ''` guard `useVfsConfig.ts`
already uses for the identical pattern.

**Revised after initial implementation, per the user:** no collapsible
"Advanced" section after all — the checkbox is always visible, and defaults to
**checked** rather than unchecked. Since the checkbox now shows a checked
state before the user has ever touched it, a
`watch(domain, …, { immediate: true })` in `LoginView.vue` persists an
explicit `true` override for any newly-seen domain the moment it's known (not
just on user interaction) — otherwise connecting before ever touching the
checkbox would silently fall back to auto-detection instead of the (checked)
state actually shown. Unchecking persists an explicit `false`, same as before.

Separately, `LoginView.vue`'s inputs are now wrapped in a real
`<form @submit.prevent="handleLogin">` (was a plain `<div>` with a JS-bound
button click) so the browser's own password manager recognizes it as a login
form and offers to save/autofill credentials — raised when asked whether
"remembering whole logins" (JID + password, not just JID) was possible;
storing passwords ourselves in `localStorage` was rejected as a real security
regression (see `specs/design/login-memory-and-vfs-config.md`), so this
delegates credential storage to the browser's own encrypted store instead.
Verified live: it's a real `<form>` element, the `Advanced` toggle button (now
removed) previously didn't trigger a submit, and pressing Enter in either
field submits natively.

**Further revised into a two-step login (JID first, password second)**, per
the user, on the same reasoning: this is the pattern Google/Microsoft's own
login pages use, and it's compatible with password-manager autocomplete/save
*if* the username `<input>` stays mounted across steps (`v-show`, never
`v-if`) rather than being unmounted when the password step appears — password
managers correlate the saved password to that DOM node, not just to whatever
was visible at submit time. Still one `<form>`, one
`@submit.prevent="handleLogin"`, submitted once at the end.

- Step 1 (`step === 'jid'`): recent-login chips, the JID input, the
  `forceSecure` checkbox, and a `type="button"` "Continue" (disabled until
  `jid` is non-empty) — advances `step` to `'password'` and focuses the
  password input. Pressing Enter in the JID field does the same via
  `@keydown.enter.prevent`, rather than relying on the browser's inconsistent
  single-text-field implicit-submit behavior. Clicking a recent-login chip
  (`pickRecentLogin`) fills the JID **and** advances straight to the password
  step itself, per the user — picking a chip is a complete choice of account,
  so it skips the extra "Continue" click a freshly-typed JID still needs.
- Step 2 (`step === 'password'`): a plain-text recap of the chosen JID plus a
  "Change" link (back to step 1, JID preserved), the password input
  (autofocused via a template ref + `nextTick`), and the real `type="submit"`
  "Connect" button.
- Verified live at both desktop and 390×844 mobile: the JID `<input>` node is
  confirmed still present in the DOM (just hidden) on step 2 with its value
  intact, the WS checkbox and recent-login chips only show on step 1, the
  password field receives focus automatically on entering step 2, and
  "Change" returns to step 1 with the JID preserved. No cross-browser
  (Firefox/Safari) autofill check done yet — only Chromium, per the caveat
  already raised when this was proposed.

Verified (via a WebSocket-constructor proxy intercepting the URL Strophe
actually opens, since no real server needed to be reachable for this check):
`admin@otherhost` with no override configured → falls through to
`VITE_XMPP_WS_URL` exactly as designed. Also confirmed at both desktop and a
390×844 mobile viewport: the checkbox is disabled until a JID with a
parseable domain is typed, becomes checked and enabled the moment one is, and
wraps correctly on the narrow viewport.

**Real bug found by the user's own local setup, fixed:** this machine's
`.env.local` has `VITE_XMPP_WS_URL=ws://localhost:5281/ws` — a non-default
*port* (`5281`, not `5280`), not just a scheme choice. The first version of
`buildWsUrl` treated *any* stored override (checked or unchecked) as "ignore
`VITE_XMPP_WS_URL` entirely, hardcode port `5280`" — so simply typing
`admin@localhost` (which the pre-checked-by-default watcher immediately
persists an override for) silently broke this machine's working local
connection, and there was no UI-reachable way back to `ws://localhost:5281/ws`,
since unchecking the box still hardcoded port `5280`
(`ws://localhost:5280/ws`, still wrong). Fixed: the override now only flips
`ws:`/`wss:` on top of whatever URL would otherwise be built
(`VITE_XMPP_WS_URL` if set, else auto-construction), via a regex replace on
the scheme, instead of replacing the whole URL and hardcoding the port.
Verified against this exact case: `admin@localhost` with the checkbox at its
default (checked) → `wss://localhost:5281/ws` (port preserved); unchecked →
`ws://localhost:5281/ws`, an exact match for `.env.local`.

Verified live via a temporary Playwright driver (not committed) and the
existing unit-test setup.
