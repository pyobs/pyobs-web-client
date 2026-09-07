# Plan: VFS endpoint auth — Basic Auth → Bearer token

Status: done. `VfsEndpoint`'s `username`/`password` → single `token`; `CameraView.vue`'s
`Authorization: Basic ...` → `Authorization: Bearer ${token}`; `SettingsView.vue`/
`EditConnectionView.vue`'s two fields → one Token field. Unit tests updated. Went one step further
than this plan's original scope while touching this code anyway: the token is now also
secure-storage-backed (Keychain/Keystore via `useCredentialStore.ts`, same pattern as the XMPP
password), not plain `localStorage` — see `specs/steering/open-items.md`'s former "VFS credentials
still unmigrated" item, now resolved by the same change. Nothing needed migrating from the old
`username`/`password` shape per this plan's own "Not in scope" call (never actually enforced
server-side, confirmed empirically against a real saved connection with none stored).

Repos: pyobs-web-client (all implementation here)

## Background

`specs/design/login-memory-and-vfs-config.md` (status: done) built this
client's VFS endpoint config — `useVfsConfig.ts`, `SettingsView.vue` — around
`pyobs.vfs.HttpFile`'s HTTP Basic Auth shape (`username`/`password`), the
only auth `HttpFile` supported at the time.

While fixing the CORS gap that blocked `specs/plans/2026-08-03-camera-page.md` phase 2
([pyobs/pyobs-core#725](https://github.com/pyobs/pyobs-core/issues/725)), it
surfaced that `pyobs.modules.utils.HttpFileCache` never actually checked the
Basic Auth credentials `HttpFile` was sending — no auth was enforced at all.
`pyobs-core` commit `9bb4314b` fixed both: CORS headers, and replaced Basic
Auth with an opt-in Bearer token (`token` param on both `HttpFileCache` and
`HttpFile` — `username`/`password` removed entirely, not deprecated
alongside). Confirmed by reading the commit directly
(`../pyobs-core/pyobs/vfs/httpfile.py`,
`../pyobs-core/pyobs/modules/utils/httpfilecache.py`).

This client's own VFS config is now stale relative to current `pyobs-core`:
harmless for the no-auth case (nothing to send either way), but any real
deployment that turns auth on can't be reached from this client at all —
there's no way to enter a token today.

## Why not folded into 2026-08-03-camera-page.md

Orthogonal to that plan's actual scope ("grab an image and see it") — VFS
endpoint config is shared infrastructure any `IData`/`IVideo`-shaped path
resolution depends on, not Camera-specific. Was blocked on an actual
`pyobs-core` release (at the time the fix only existed in an unpublished commit
— see 2026-08-03-camera-page.md's phase 2 notes on the editable-install workaround used
to verify against it); that release has since shipped, so this is no longer
blocked, just not yet implemented on the client.

## Scope

- `useVfsConfig.ts`: `VfsEndpoint` type's `username`/`password` fields →
  single `token`. `resolveVfsEndpoint()`'s return shape stays the same
  otherwise (still `{ endpoint, url }`).
- `SettingsView.vue`: the username/password form fields → a single token
  field. Existing `localStorage`-persisted endpoints with old-shape
  `username`/`password` become dead fields (harmlessly ignored, not
  actively migrated — no deployment has real credentials stored this way
  yet, per `login-memory-and-vfs-config.md`'s own "Storing VFS credentials
  in localStorage" caveat; this was always a low-stakes store).
- `CameraView.vue`'s `Authorization: Basic ${btoa(...)}` header construction
  → `Authorization: Bearer ${token}`.
- Unit tests (`useVfsConfig.spec.ts`) updated for the new shape.

## Not in scope

- Migrating existing stored `username`/`password` endpoint entries to
  `token` — nothing to migrate from (Basic Auth was never actually enforced
  server-side, so no real deployment depends on it working today).
- Any other `HttpFile` consumer beyond Camera — none exist yet in this
  client.

## Blocked on

Resolved: the `pyobs-core` release containing commit `9bb4314b` has shipped (now at `2.0.0.dev76`).
Remaining action: `specs/steering/testing-against-live-backend.md`'s pinned
`pyobs-core[full]==2.0.0.dev53` needs bumping to that release, for `testing/.venv` to pick it up
normally instead of the editable-install workaround.
