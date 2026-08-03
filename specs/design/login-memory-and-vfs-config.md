# Remember previous logins + per-connection config (VFS endpoints)

Status: implemented, closed.

Two related but distinct asks: (1) let the user pick a previously-used JID at
login instead of retyping it, and (2) a place to store settings specific to a
given pyobs account/deployment, starting with VFS endpoint definitions —
needed to resolve VFS-style path strings (e.g. `IData.grab_data()`'s return
value, or `IVideo`'s `VideoCapabilities.video`, per `pyobs-core`'s
`pyobs/vfs/`) into real fetchable URLs, which is the prerequisite for ever
displaying an image in this client. Actually rendering an image from a
resolved URL is explicitly **not** part of this doc — see "Not in scope"
below (that became `specs/plans/camera-page.md`).

## Outcome

**Done, verified live and via unit tests.** Built per the design below, with
one correction after live testing: `useXmpp.ts` gained a `localStorage`-backed
`recentLogins` list (JIDs only, capped at 10, moved-to-front on successful
connect). First surfaced in `LoginView.vue` via a native `<datalist>` on the
JID input — live testing showed this wasn't reliably visible (no dropdown
appeared on click in a real browser check, not just a screenshot artifact), so
it was replaced with an explicit "Recent logins" row of clickable button chips
above the JID field, matching this app's existing buttons-over-hidden-native-
widgets convention (same reasoning as Shell's module/method chips). New
`src/composables/useVfsConfig.ts` holds the per-bare-JID `vfsEndpoints` store
(`localStorage`, `HttpFile`-shaped only) with `resolveVfsPath()` and
add/update/remove CRUD, and a new `SettingsView.vue` (routed at `/settings`,
sidebar entry added) manages endpoints for the current account —
stacked-input form, same styling/mobile pattern as the rest of the app.
Unit-tested in `src/__tests__/useVfsConfig.spec.ts` (44/44 passing, including
per-account isolation and path-resolution edge cases: leading slash, no
trailing slash on `baseUrl`, unknown root, rootless path). Verified live at
desktop and mobile (390×844) viewports: recent-login chips fill the JID field
on click, Settings add/edit/remove all persist correctly and re-populate the
form on edit.

## Background: what a VFS path actually is

Checked against `../pyobs-core`'s `pyobs/vfs/vfs.py` and `pyobs/vfs/httpfile.py`,
and `../pyobs-gui`'s `videowidget.py` (the reference client-side consumer): a
VFS path looks like `"pyobs/2024/07/03/image.fits.gz"` — a root name
(`"pyobs"`), then a relative path. Server-side config maps each root name to a
backend (`LocalFile`, `SFTPFile`, `SMBFile`, `HttpFile`, …); a *client* (like
`pyobs-gui`, or this web client) needs its own, independently-configured
mapping from root name to something it can actually reach — for a browser,
that can only ever be `HttpFile`'s shape (`download` base URL, optional
`username`/`password` for HTTP Basic Auth). There is no wire-level way to
fetch a client's VFS root config from the server — `pyobs-gui` gets it from
its own local YAML config file; this is this client's equivalent, stored
per-account in the browser instead of a config file.

## 1. Remember previous logins

- New `localStorage` key (persists across browser sessions, unlike the
  `sessionStorage`-based active-session credentials in `useXmpp.ts`) storing a
  list of previously-used bare JIDs, most-recent-first, capped at a small
  number (10) to avoid unbounded growth.
- **JIDs only, never passwords**, in this list. `sessionStorage` password
  persistence is scoped to survive a reload within the same tab/session — a
  materially different trust boundary from `localStorage`, which persists
  indefinitely on disk. Storing passwords there would be a real security
  regression, not just a style choice.
- `connect()`, on success, moves the just-used JID to the front of the list
  (dedup by exact string match).
- `LoginView.vue` renders the list next to/under the JID input as a small
  row of button chips — picking one fills the JID field; password is always
  typed fresh, every time.
- Signing out does not remove a JID from this list — it's a login-convenience
  list, independent of the active-session marker.

## 2. Per-connection config store (VFS endpoints)

- New `localStorage`-backed store, **keyed by bare JID** (per-account, not
  per-domain — see "Decided" below), holding a small settings object. First
  field: `vfsEndpoints: Array<{ root: string; baseUrl: string; username?: string; password?: string }>`
  — mirrors `HttpFile`'s own config shape, since that's the only VFS backend a
  browser can talk to directly.
- `useVfsConfig()` exposes:
  - the current connection's `vfsEndpoints` list (empty until the user
    defines any).
  - `resolveVfsPath(path: string): string | null` — splits the root off a
    VFS-style path (mirrors `VirtualFileSystem.split_root` in `pyobs-core`),
    looks up a matching endpoint, and returns `baseUrl + rest-of-path`, or
    `null` if no endpoint is configured for that root.
  - CRUD functions to add/edit/remove endpoints, persisted to `localStorage`
    immediately on change.
- `SettingsView.vue` + sidebar nav entry, where the connected user manages VFS
  endpoints (root name, base URL, optional username/password) for the current
  account — a list of existing endpoints plus a small add/edit form, same
  dark-themed styling as the rest of the app.
- **Storing VFS credentials in `localStorage`, in plaintext, is a real
  tradeoff**, worth naming explicitly: convenient, but readable by anything
  with access to that browser profile. Similar risk class to the already-
  `sessionStorage`d XMPP password, not a new category of risk — but flagged
  separately since VFS/archive credentials might be higher-privilege or
  shared across users in some deployments.

## Not in scope

- **Actually rendering images.** Resolving a VFS path to a URL is only useful
  once something in the UI (Shell result formatting, or a Dashboard
  capability card for `IVideo`/`IData`-shaped capabilities) recognizes a
  VFS-path-shaped string and renders it as an image instead of raw text. Real,
  valuable follow-up work, but a separate design decision on its own —
  notably, FITS files (the common case for `IData.grab_data()`) aren't
  natively browser-renderable and would need either server-side conversion or
  a JS FITS-to-canvas decoder, which `IVideo`'s browser-friendly
  preview-image case doesn't need. See `specs/plans/camera-page.md`.
- **VFS write access** (`HttpFile`'s `upload` side) — nothing in the app
  performs uploads today; only read/`download` matters for the display use
  case that motivated this.

## Decided

- **Config granularity: per-account** (keyed by bare JID), confirmed with the
  user — different users of the same deployment may hold different HTTP
  Basic Auth credentials for the same archive server.
- **Remembered-logins cap: 10**, confirmed with the user.
- **VFS endpoint config: `HttpFile`-shaped only**, confirmed with the user —
  no other backend shapes (`SFTPFile`/`SMBFile`/etc.) supported, since those
  are fundamentally unreachable from a browser anyway.
