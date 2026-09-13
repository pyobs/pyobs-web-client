# Plan: Linked-apps list (reach web-admin/portal/weather from this app)

Status: proposed

Repos: pyobs-web-client (all implementation here)

Design: `specs/design/embedded-app-auth.md` (issue #48) — every decision below is already settled
there; this plan is just the file-level sequencing.

## Context

`embedded-app-auth.md` resolved issue #48 to: plain external links (full app switch, browser owns
SSO), an editable `{label, url, icon?}` list with no built-in "official vs. custom" distinction,
`icon` defaulting to `{domain}/favicon.ico`, and the three known entries (weather/portal/web-admin)
pre-filled with a domain-guessed URL (`weather.<domain>`/`observe.<domain>`/`admin.<domain>`,
confirmed against real fleets) the moment a new account's domain is first seen — never silently
trusted, always editable.

This plan is the actual implementation: a composable, a Settings CRUD section, and the two places
the links actually need to be tappable (compact `MoreView.vue`, desktop `AppLayout.vue` sidebar).

## Scope

1. **New `src/composables/useLinkedApps.ts`.** Mirrors `useVfsConfig.ts`'s exact shape — localStorage
   (`pyobs_linked_apps`), keyed by bare JID (per-account, same reasoning as VFS endpoints: different
   accounts on the same install may want different links), `ref`/`computed` reactivity, plain CRUD
   (`addLink`, `updateLink`, `removeLink`).
   - Type: `type LinkedApp = { label: string; url: string; icon?: string }`.
   - **Seeding**: when `linkedApps` computes for a bare JID with no stored entry at all yet (first
     time this composable is used for that account — "on first connect" per the design doc), seed
     three rows from `Strophe.getDomainFromJid(bareJid)`:
     - `{ label: 'Weather', url: `https://weather.${domain}`, icon: `https://weather.${domain}/favicon.ico` }`
     - `{ label: 'Portal', url: `https://observe.${domain}`, icon: `https://observe.${domain}/favicon.ico` }`
     - `{ label: 'Web Admin', url: `https://admin.${domain}`, icon: `https://admin.${domain}/favicon.ico` }`
     Persisted immediately (not just computed) so the user's own edits/deletes afterward stick —
     seeding must only ever happen once per account, never re-run over a user's edits.
   - No pipeline entry — still excluded per the design doc.

2. **`SettingsView.vue` — new "Linked Apps" section.** Copy the existing "VFS Endpoints" section's
   exact structure (list of rounded cards + inline add/edit form) for `useLinkedApps()`: fields
   `label`, `url`, `icon` (optional). No token/secret handling needed here (unlike VFS), so this is
   simpler than the VFS section it's modeled on — plain fields, no secure-storage round-trip.
   Icon preview in each card: `<img :src="entry.icon" @error="...">` falling back to a generic
   Bootstrap icon (e.g. `bi-link-45deg`) on missing/broken `icon`.

3. **`MoreView.vue` (compact shell) — render the list as external links.** One `.more-row` per
   `linkedApps` entry, alongside the existing Events/Shell/Settings rows — `<a :href="entry.url">`
   (not `@click="navigate(...)"`, since these are plain external opens, not internal router
   navigation) with the entry's icon (small `<img>`, same fallback as the Settings card) instead of
   a Bootstrap glyph.

4. **`AppLayout.vue` (desktop sidebar) — same rows under "Tools".** Mirrors step 3's markup style
   (`sidebar-link` class instead of `more-row`), added after the existing Settings link, before the
   "Modules" section. Same `<a :href>` + icon-with-fallback treatment.

5. **No native/`Capacitor.isNativePlatform()` gating anywhere** — per the design doc, plain links
   already do the right thing on both web and native given this app's `capacitor.config.ts` (no
   `server.allowNavigation` entries for these domains).

## Explicitly out of scope

(Mirrors the design doc's "Not in scope"/"Now out of scope" — not re-litigated here.)

- Any in-app overlay/OAuth mechanism, Keycloak realm config changes, native plugins — the whole
  overlay design was rejected in favor of plain links.
- `pyobs-pipeline` as a fourth entry — no Keycloak integration there yet; add it as a plain custom
  row (or a fourth seeded default) once that work lands, no design change needed here.
- Logout propagation — resolved as "does not propagate," nothing to build.
- A dedicated icon-handling component — three small, near-identical `<img>`+fallback usages
  (Settings card, More row, sidebar row) don't justify extracting a shared component yet.

## Verification

- Manual: fresh account (no stored `pyobs_linked_apps` entry) shows the three seeded rows with
  guessed URLs on first login; editing/deleting one and reloading confirms it doesn't get
  re-seeded.
- Manual: add/edit/remove a custom entry in Settings, confirm it appears in both `MoreView.vue`
  (compact) and the desktop sidebar immediately (shared reactive `linkedApps`).
- Manual: tap/click a linked-app row — compact shell (or narrow viewport) and desktop both open the
  URL as a real external navigation (new tab on web; system browser, not an in-app view, on a
  native build) — confirms the "no special mechanism needed" design decision actually holds in
  practice, not just in `capacitor.config.ts` theory.
- Icon fallback: an entry with a broken/missing `icon` shows the generic placeholder glyph, not a
  broken-image icon, in all three render locations.

## Open questions

- None — the design doc settled every decision needed to implement. Icon fallback glyph choice
  (`bi-link-45deg` vs. something else) is a cosmetic pick, not a blocking question.
