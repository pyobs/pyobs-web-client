# Auth for embedding other pyobs apps (web-admin, portal, weather)

Status: proposed. **Superseded by a simpler decision — see "Revised (2026-09-13): plain external
links, no overlay" below.** The investigation that follows is kept because it's what established
*why* the simple answer is actually correct (not just easier) — the more elaborate overlay design
it originally proposed is now rejected, not built.

Issue: pyobs/pyobs-web-client#48.

## The problem

The goal is to reach `pyobs-web-admin`, `pyobs-portal`, and `pyobs-weather` from inside this app
without a separate login per app. Issue #48 framed this as two open questions — does a shared
Keycloak realm exist, and iframe vs. separate view — and flagged (but didn't resolve) a specific
risk: a Capacitor app's WebView doesn't share cookies with the system browser, which can break
redirect-based SSO.

Both questions turned out to be more load-bearing than the issue anticipated, and coupled to each
other rather than independent:

- **Realm**: confirmed shared — one `pyobs` realm per fleet/installation (`pyobs-auth`'s
  `docs/source/architecture.rst`: "every service trusts exactly one Keycloak realm"), with
  per-service *and* per-installation clients/groups inside it (e.g. weather gets a distinct client
  and group per site — `iag50srv-weather` / `/pyobs-weather-iag50srv` — not one shared group, which
  would authorize every site's instance at once; see `pyobs-iag50/specs/topology/keycloak-service-topology.md`
  and `pyobs-weather/specs/plans/2026-09-02-keycloak-login.md`). Confirmed clients: web-admin
  (`pyobs_web_admin/settings.py`), portal (`pyobs_portal/settings.py`), weather
  (`pyobs_weather/settings.py`, per-installation).
- **`pyobs-pipeline` has no Keycloak/OIDC integration at all today** — zero config, confirmed by
  grep across its code/docs. Not a blocker for web-admin/portal/weather, but embedding pipeline
  isn't possible until that lands separately (decided below: tracked there, not designed here).
- **The cookie-sharing risk is a hard architectural wall, not an edge case.** An "embedded
  user-agent" (this app's own WKWebView/Android WebView, and any iframe inside it) has a cookie
  store that's categorically isolated from the system browser's — this isn't a third-party-cookie
  config issue to work around, it's why RFC 8252 ("OAuth 2.0 for Native Apps") mandates that native
  apps must not perform OAuth in an embedded webview at all. Keycloak's own `check-sso`/silent-SSO
  mechanism additionally depends on third-party cookies inside a hidden iframe, which Safari/WKWebView
  has blocked outright since iOS 13.1 (Keycloak's own project is discussing dropping that mechanism —
  [keycloak/keycloak#30771](https://github.com/keycloak/keycloak/discussions/30771)). So true inline
  embedding (an iframe/WKWebView showing an embedded app's actual page) cannot get silent SSO on iOS
  regardless of whether the realm is shared.
- **The issue's own proposed mitigation needs a correction**: `@capacitor/browser` (the official
  plugin) uses `SFSafariViewController` on iOS, which — despite being a "system" UI — does **not**
  share cookies with Safari either. What actually shares cookies with the system browser is
  `ASWebAuthenticationSession` on iOS and Chrome Custom Tabs (`androidUseCustomTabs: true`) on
  Android — the RFC 8252 "external user-agent" pattern, a different and more specific mechanism than
  a generic in-app browser tab.

## Design

- **Web build: plain links, no special mechanism.** All of the cookie-jar-isolation problem this
  doc works through is specific to the native app's embedded WebView — a normal browser tab has no
  such isolation, so a plain `<a href="https://portal...">` (or `window.open`) gets ordinary
  browser-native Keycloak SSO across sites for free via normal top-level navigation and the
  browser's own shared cookie jar. Everything below (the overlay mechanism, the realm cookie
  change, the plugin question) is native-only — gated the same way `usePushNotifications.ts` gates
  native-only behavior (`Capacitor.isNativePlatform()`), not something the web build needs at all.
- **Mechanism: every embedded-app open goes through the external-user-agent overlay**
  (`ASWebAuthenticationSession` on iOS, Chrome Custom Tabs on Android), not just as a one-time login
  step — decided with the user: no true inline rendering, an overlay/tab per app is acceptable UX.
  This is what makes "log in once, stay logged in for the rest" work for free: each open is an
  ordinary top-level OIDC redirect through Keycloak, which finds the existing SSO session cookie
  (already sitting in the shared Safari/Chrome cookie jar from the first login) and skips straight
  past the login form — no need for Keycloak's fragile third-party-cookie silent-SSO trick.
- **Trigger: lazy** — decided with the user. No startup-time silent SSO check; the first tap into
  an embedded-app entry point is what triggers the first (possibly interactive) login. Subsequent
  taps, to the same or a different embedded app, redirect silently through the already-established
  session.
- **Realm config change required: enable persistent ("Remember Me") session cookies on the `pyobs`
  realm** — decided with the user, included as a required step rather than left open. Reasoning:
  Apple's own developer forums report `ASWebAuthenticationSession` reliably shares *persistent*
  cookies (explicit expiry) with Safari, but not consistently *session* cookies (no expiry) — and
  Keycloak's SSO cookie (`KEYCLOAK_SESSION`/`KEYCLOAK_IDENTITY`) is a plain session cookie by default.
  Without this change, "remembered login" may work on Android (Custom Tabs shares Chrome's cookie
  jar directly and more reliably) but is a real risk on iOS. This is a Keycloak realm-admin config
  change (fleet infra), not an app code change — needs locating how the `pyobs` realm is actually
  provisioned (see Open questions) before it can be scheduled as work.
- **Android is the lower-risk platform** — Custom Tabs shares the real system Chrome's cookie jar
  directly; no equivalent uncertainty to the iOS session-vs-persistent-cookie behavior.
- **Scope: web-admin, portal, weather only.** `pyobs-pipeline` embedding is excluded from this
  design — decided with the user ("pipeline will follow later") — since it has no Keycloak
  integration to embed against yet.

## Not in scope

- **True inline rendering** (an iframe/WKWebView showing an embedded app's actual content within
  this app's own screen) — decided out of scope per the user. If ever revisited, the two paths that
  could make it work are (a) manually bridging cookies from the overlay session into the app's
  WKWebView cookie store via a small native plugin (`WKHTTPCookieStore.setCookie`), or (b)
  token-passing (the issue's original option 2: this app holds Keycloak tokens and hands them to
  embedded content directly) — both real engineering, neither justified given the overlay is
  acceptable.
- **`pyobs-pipeline` embedding** — blocked on pipeline having no Keycloak/OIDC integration;
  tracked as a separate prerequisite in that repo, not designed here.
- **Startup-time silent SSO check** — decided lazy/on-tap only, per above.
- **Logout propagation** (does logging out of pyobs-web-client need to end the shared Keycloak
  session, affecting the other embedded apps too, or just this app's own local state?) — not
  discussed yet; listed as an open question below rather than assumed either way.

## Decided

Confirmed with the user, 2026-09-13:

- **Shared realm confirmed** (per-fleet/installation `pyobs` realm, per-service/per-installation
  clients) — resolves issue #48's first open question.
- **Embedding mechanism: overlay/tab (external user-agent) for every embedded-app open, not true
  inline rendering.** Resolves issue #48's second open question, and does so in the specific way
  that also satisfies the "remember login for other sites" requirement — this and the mechanism
  question aren't independent, the same choice answers both.
- **`pyobs-pipeline` explicitly out of scope for this pass** — "pipeline will follow later."
- **Persistent/"Remember Me" Keycloak session cookies: in scope as a required step**, not left as
  an unresolved risk.
- **Login trigger: lazy (on first embedded-app tap), not proactive at startup.**
- **Web build needs no special handling — plain links only.** Everything else in this doc (the
  overlay mechanism, the realm cookie change, the plugin question) is native-only.

## Open questions

- **Which Capacitor plugin actually implements this** — `ASWebAuthenticationSession` (iOS) +
  Custom Tabs with `androidUseCustomTabs` (Android) for generic OIDC, not tied to a specific social
  provider. Not evaluated in this pass; `@capacitor/browser` is confirmed wrong (SFSafariViewController,
  no cookie sharing). Needs a real survey of maintained options (or a thin native wrapper) before
  implementation.
- **How is the `pyobs` realm actually provisioned/managed** (Keycloak admin console by hand,
  Terraform, a GitOps config repo)? Needed to know how to actually schedule and land the persistent-
  cookie change decided above. Not investigated in this pass.
- **Deep-linking into a specific page/section of an embedded app** (e.g. web-admin's dashboard vs.
  just wherever the post-login redirect lands) vs. just reaching its landing page — not decided.
- **Logout propagation** — see "Not in scope" above; genuinely undecided, not just deferred.
- **Real-device verification of the iOS session-cookie-sharing behavior specifically** — Apple's own
  forums report inconsistency across iOS versions; must be confirmed on-device once the persistent-
  cookie realm change lands, not assumed from documentation alone.

## Revised (2026-09-13): plain external links, no overlay

Asked directly: is staying in-app for the embedded-app hop actually a requirement, or would a full
app switch (leaving to the real system browser) be acceptable? **The user confirmed a full app
switch is fine.** That changes the answer completely — the entire overlay mechanism above
(`ASWebAuthenticationSession`/Custom Tabs, the plugin survey, the persistent-cookie realm change)
was only needed to get SSO-reliable cookie sharing *without* leaving the app. Once leaving the app
is acceptable, none of that machinery is needed: a link to the real system browser gets the real
Safari/Chrome cookie jar directly, with no partial-sharing ambiguity to design around.

**New design:**

- **Every embedded-app entry point is a plain link** (`<a href="https://portal...">` or
  equivalent) — identical on web and native, no platform branching.
- **No plugin, no `Capacitor.isNativePlatform()` gating, no native code at all.** Confirmed against
  this app's actual `capacitor.config.ts`: it sets no `server.allowNavigation` (empty/default), and
  Capacitor's own documented default behavior is that any external-origin navigation not covered by
  `allowNavigation` opens in the system browser automatically — so a plain link to web-admin/
  portal/weather already does the right thing today, with zero config changes needed in this repo.
- **Real Safari/Chrome cookie jar, no ambiguity.** This isn't `ASWebAuthenticationSession` or
  `SFSafariViewController` — it's the literal browser app, so there's no session-vs-persistent-cookie
  sharing question to worry about. Ordinary Keycloak session cookies work exactly as they would in
  any normal browser, on any platform.
- **The persistent/"Remember Me" realm cookie change is no longer required** by this design — it
  was a mitigation for `ASWebAuthenticationSession`'s specific partial-sharing behavior, which no
  longer applies. (Might still be worth doing for other reasons, e.g. long-lived sessions in
  general — but that's a separate conversation, not something this feature needs.)
- **Scope unchanged**: web-admin, portal, weather; `pyobs-pipeline` still excluded from this
  feature's implementation. Update: pipeline's Keycloak login is now actively being built (in
  `pyobs-pipeline` itself, not here) — once that lands, adding pipeline as a fourth entry is just
  more rows in the same generic link list, no design change needed here.

**Now out of scope (rejected, not deferred):**

- The `ASWebAuthenticationSession`/Custom Tabs overlay mechanism, the Capacitor-plugin survey, and
  the Keycloak realm persistent-cookie change — all superseded by the plain-link approach.
- True inline rendering — still rejected, same reasoning as before, now doubly so since there's no
  overlay-based login step to bridge cookies from either.

**Resolved**: **logout does not propagate.** Logging out of pyobs-web-client (XMPP credentials)
does nothing to the Keycloak session sitting in the system browser, and this design doesn't add
anything to change that. Reasoning: the two are unrelated auth systems — this app's login is XMPP
(JID/password via strophe.js), never touches Keycloak, and the Keycloak session lives entirely in
the system browser once established there. Propagating would mean deliberately opening a Keycloak
logout URL on XMPP logout, coupling two identities that aren't necessarily even the same account,
and would be surprising behavior no comparable app does (logging out of the Twitter app doesn't log
you out of twitter.com in Safari). One real residual risk, named rather than solved: on a **shared
device**, the browser's Keycloak session outlives any pyobs-web-client logout, so the next person to
tap an embedded-app link inherits the previous person's session — a pre-existing shared-device
concern independent of this feature, not something an app can fix without an OS hook that doesn't
exist.

**Resolved**: **direct links to the specific page/section, not just each app's landing page** —
decided with the user. If the target page requires auth and the browser doesn't have a session yet,
Keycloak's normal redirect flow takes over and lands the user back on that same deep link after
login (standard OIDC `redirect_uri`/relay-state behavior) — no extra work needed here, this falls
out of "let the browser handle SSO" the same way the rest of this design does.

## Extended: editable link list + domain-guessed defaults (2026-09-13)

Grew out of resolving the auth question above: since these are now just links, the app needs
somewhere to keep them. Settled shape:

- **One generic, user-editable list** of `{ label, url, icon? }` entries — no built-in distinction
  between "official pyobs project" and "custom," matching how `recentLogins`/VFS endpoints
  (`useServerConfig.ts`/`useVfsConfig.ts`) already handle similar per-user config in this app. This
  also means adding `pyobs-pipeline` later, or a site linking something unrelated (Grafana, etc.),
  is just another row — no code change needed.
- **`icon` defaults to `{entry's own domain}/favicon.ico`**, overridable, blank/error falls back to
  a generic placeholder icon. Reliable now that web-admin/portal/weather all serve a real
  `favicon.ico` at their site root (see the favicon-unification work landing alongside this doc —
  web-admin `v2.3.3`, portal `v2.5.1`, weather in progress on a separate fresh design).
- **URL for the three known entries (web-admin/portal/weather) is guessed on first connect from the
  XMPP JID's domain**, pre-filled as an editable default rather than silently trusted — confirmed
  against real fleets, not assumed:
  - `weather.<domain>` — exact match on IAG-VT (`weather.iagvtsrv.astro.physik.uni-goettingen.de`)
    and IAG50 (`weather.iag50srv.astro.physik.uni-goettingen.de`).
  - `observe.<domain>` (portal) — exact match on MONET south (`observe.monet.saao.ac.za`, XMPP
    domain `monet.saao.ac.za`) and MONET north (`observe.monet.as.utexas.edu`, XMPP domain
    `monet.as.utexas.edu`). Note: an earlier pass here wrongly concluded this pattern was broken,
    based on a stale URL found in `pyobs-monet/config/north/monet/robotic.yaml`
    (`observe.monet.uni-goettingen.de`) that no longer matches the real deployment — corrected by
    the user directly; a checked-in config file isn't proof of current live state, it needs to be
    treated as possibly stale, not as confirmed reality.
  - `admin.<domain>` (web-admin) — confirmed by the user directly ("it's admin.<domain>
    everywhere"), no counter-evidence.
  - Still pre-filled as an editable suggestion, never auto-saved/trusted without the user seeing
    it — same lesson this repo already learned once for WS-URL guessing
    (`specs/design/per-domain-websocket-config.md`): confirmed-in-N-known-fleets isn't the same
    guarantee as reliable-everywhere, and a wrong guess should be a one-tap fix, not a silent
    failure.
