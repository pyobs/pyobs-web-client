# pyobs-web-client

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Connecting to an XMPP Server

This app authenticates by opening a WebSocket connection directly to an
ejabberd server (via strophe.js) — there is no HTTP/REST login endpoint and
no backend of its own. Logging in requires a reachable ejabberd server with
a registered account, and its `ejabberd_http` listener must map the `/ws`
path to `ejabberd_http_ws` under `request_handlers` (see ejabberd's
[WebSocket docs](https://docs.ejabberd.im/admin/configuration/listen/#websocket)),
e.g. in `ejabberd.yml`:

```yaml
listen:
  -
    port: 5280
    ip: "::"
    module: ejabberd_http
    tls: false
    request_handlers:
      /ws: ejabberd_http_ws
      /admin: ejabberd_web_admin
```

By default the app connects to `ws(s)://<jid-domain>:5280/ws`, choosing
`ws://` or `wss://` to match the protocol the frontend itself is served
over. If your ejabberd's port 5280 listener has `tls: true` but you're
running the Vite dev server over plain `http://`, override the URL
explicitly in `.env.local`:

```
VITE_XMPP_WS_URL=wss://localhost:5280/ws
```

(Restart `npm run dev` after adding this — Vite only reads env files at
startup.) This is safe even though the page itself is `http://`: browser
mixed-content rules only block a secure page from opening an insecure
connection, not the other way around.

If ejabberd uses a self-signed certificate, the browser's WebSocket API has
no way to bypass the trust check (unlike `curl -k`), so login will fail
silently with "Connection failed. Check server address." until the browser
trusts that cert. Open `https://localhost:5280/admin` (or any path served by
the same listener) directly once and accept the certificate warning — that
caches the trust decision for `localhost:5280` and lets the app's `wss://`
connection through.

### Run Unit Tests

Fast, no external dependencies — covers `src/pyobs-codec.ts`'s wire-protocol
encode/decode logic.

```sh
npm run test:unit
```

### Run End-to-End Tests

Drives the real app in a browser against a **live pyobs-core XMPP server** —
there is no mocked backend. Requires an ejabberd server with at least one
pyobs-core 2.0 module online, and Playwright's browser installed once via
`npx playwright install chromium`.

```sh
XMPP_TEST_JID=you@your.server XMPP_TEST_PASSWORD=yourpassword npm run test:e2e
```

Tests skip themselves with a clear reason if the credentials aren't set, or if
no module comes online within 30s. A few tests (enum-typed params, RPC
faults) additionally skip if the connected module doesn't implement the
relevant interface (e.g. `IImageFormat`, `IConfig`) — they cover that ground
when available rather than assuming every environment has the same modules.
