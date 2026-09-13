# Auth for embedding other pyobs apps (web-admin, portal, weather)

Status: proposed.

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
  would authorize every site's instance at once; see `pyobs-iag50/specs/design/keycloak-service-topology.md`
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
