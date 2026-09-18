# Releasing

How to cut and publish a `pyobs-web-client` release. The mechanics are automated in
`.github/workflows/`; this documents the human steps that drive them.

## Overview

A release is a `vX.Y.Z` tag on `main`. Pushing the tag runs the whole pipeline:

1. **`release.yml`** — `npm ci` + `npm run build` (type-check + Vite), zips `dist/` into
   `pyobs-web-client-<tag>.zip`, builds the Android debug APK, and creates a GitHub Release with
   auto-generated release notes (`generate_release_notes: true`).
2. **`docker.yml`** — when that Release workflow completes, builds and pushes
   `ghcr.io/pyobs/pyobs-web-client:<tag>` and `:latest`.

## Branch model

- **`develop`** — integration branch; all feature work lands here.
- **`main`** — releases only. Every release is `develop` merged into `main`, then tagged on
  `main`. Tags never live on `develop`.

## Steps

### 1. Land the work on `develop` and let CI go green

`ci.yml` runs type-check, unit tests, and a production build. A release should only be cut from a
green `develop`.

### 2. Update `CHANGELOG.md`

The repo follows Keep a Changelog + Semantic Versioning (see the file header). Add an
`## [X.Y.Z] - YYYY-MM-DD` section with the notable changes. *(Note: the changelog is currently
stale — it stops at `0.1.0` while tags run to `0.11.0` — so backfill as you go, or at minimum
start recording from the next release.)*

### 3. Bump the version

`package.json`'s `version` is the single source of truth. `android/app/build.gradle` derives the
Android `versionName` (the raw version) and `versionCode` (major·10000 + minor·100 + patch) from
it, so there is no second Android version to bump. `package-lock.json` also carries the version
twice (root `version` and `packages[""].version`), and `npm ci` requires the lockfile to be in
sync — so bump them together, not by hand-editing `package.json` alone.

`npm version` bumps both files. By default it *also* commits and tags; the tag belongs on `main`,
so skip both and make the commit yourself:

```sh
git checkout develop
git pull
npm version patch --no-git-tag-version   # or minor / major, per SemVer
git add package.json package-lock.json
git commit -m "vX.Y.Z"
```

(`--no-git-tag-version` disables *both* the commit and the tag — it leaves the bumped files in the
working tree for you. `npm version` also needs a clean tree, so commit or stash anything else
first.)

### 4. Merge into `main`

```sh
git checkout main
git pull
git merge --no-ff develop -m "Merge develop into main for vX.Y.Z release"
```

### 5. Tag and push

Tag the merge commit (an annotated tag is fine), then push with tags:

```sh
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --follow-tags
```

Pushing the tag is what triggers `release.yml`.

### 6. Verify

- The GitHub Release appears with `pyobs-web-client-vX.Y.Z.zip` **and** the debug APK
  (`android/app/build/outputs/apk/debug/app-debug.apk`) attached.
- `docker.yml` runs and pushes `ghcr.io/pyobs/pyobs-web-client:vX.Y.Z` and `:latest`.

## Notes and gotchas

- **`release: published` doesn't fire from a tag push.** `release.yml` publishes via the default
  `GITHUB_TOKEN`, and GitHub deliberately does not cascade workflow triggers from events authored
  by that token (anti-recursion guard). `docker.yml` therefore keys off `workflow_run` on the
  Release workflow *completing*; `release: published` is kept only for a manual re-publish. This
  bit v0.6.0 (the image had to be built by hand) — don't "fix" the trigger.
- **The APK is a debug build**, signed with the checked-in `android/app/debug-shared.keystore`
  (same key as local `cap run android`), not a production/Play Store artifact. iOS is still
  blocked on Apple Developer Program + Mac access — see
  `specs/design/native-app-shell-capacitor.md`.
- **The release gates on type-check.** `npm run build` runs `vue-tsc --build` before `vite
  build`, so a type error fails the release workflow — keep `develop` type-clean.
- **`npm version` skips nothing on its own.** It will run commit hooks if any exist (this repo
  currently has none configured) and will not push — steps 4-5 are yours.

## Versioning

SemVer, with the caveat that the project is still `0.x`: the changelog header commits to SemVer,
and bumping is left to the person cutting the release (`patch`/`minor`/`major`) — there's no
automated convention determining the bump size yet.
