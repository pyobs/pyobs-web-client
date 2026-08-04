# Testing against a live backend

This client has no mocked backend for manual testing (the e2e suite doesn't
either, see `README.md`'s "Run End-to-End Tests") — verifying a change means
running the real thing against a real ejabberd server with real pyobs-core
dummy modules attached. `testing/pyobs-gui-configs/` gives you a ready-made
set of module configs for that, ported from `pyobs-gui`'s own `test/*.yaml`
(the Qt client's equivalent widget-parity test matrix) — no need to hand-roll
a config from scratch for each new page.

## Layout

`testing/pyobs-gui-configs/xmpp/` holds the adapted configs, one per
[`pyobs-gui`'s own `test/*.yaml`](https://github.com/pyobs/pyobs-gui/tree/master/test)
(the upstream source — not duplicated here, per `CLAUDE.md`'s "Cross-repo
context"; diff against it directly if you want to see what changed). Each
file is individually verified to start cleanly against a local ejabberd —
see its header comment (which links the specific original it came from) for
exactly what it needs.

## Why they need adapting

`pyobs-gui`'s test configs wire every dummy module together with the GUI
itself in one process via `pyobs.comm.local.LocalComm` — an in-process
transport with no network involved, since the Qt GUI is just another
submodule in the same `MultiModule`. This client is the opposite: a browser
tab connecting over real XMPP as its own independent identity, so it can
never be "just another submodule" in that process. The adaptation is
mechanical, applied uniformly:

1. Drop the `gui:` submodule entirely — this client logs in separately
   instead.
2. Replace every remaining submodule's
   `comm: {class: pyobs.comm.local.LocalComm, name: X}` with:
   ```yaml
   comm:
     class: pyobs.comm.xmpp.XmppComm
     domain: localhost
     use_tls: True
     ignore_cert_errors: True
     user: X
     password: pyobs
   ```
   (`X` = the same name the module already had — keeps `pyobs-gui`'s own
   per-widget test scenarios recognizable.)

**Trap already hit once**: if you factor the XMPP block into a YAML anchor
for reuse across submodules (as `full.yaml` does — 8 submodules, all
identical `domain`/`use_tls`/`ignore_cert_errors`), do **not** name the
anchor's own top-level key `comm:`. `MultiModule` reads its *own* top-level
`comm:` key too, and will try to open the bare anchor (no `user`/`password`)
as its own connection, failing with `ValueError: No XMPP client.` on
startup. Name the anchor key something else (`_comm_base: &comm`, per
`xmpp/full.yaml`) so only the intentional per-submodule `<<: *comm` merges
pick it up.

## Prerequisites

- A local ejabberd reachable at `localhost:5222` (server-to-module) and
  `localhost:5281` (WebSocket, for the browser) — already running as a
  system service in this dev environment; `ss -tln | grep -E "5222|5281"`
  confirms.
- An ejabberd account per module name you intend to run, all on domain
  `localhost`, all with password `pyobs` (matching every `xmpp/*.yaml`
  file). Check what's already registered:
  ```sh
  ejabberdctl registered_users localhost
  ```
  Register anything missing (needs to run as the `ejabberd` user):
  ```sh
  sudo -u ejabberd ejabberdctl register <name> localhost pyobs
  ```
  `admin` (this client's own login, see below) and most single-widget module
  names (`roof`, `telescope`, `camera`, `mode`, `acquisition`, `autofocus`)
  tend to already exist from other local pyobs testing; `guiding`, `video`,
  and `spectrograph` are more likely to need registering.
- A Python environment with `pyobs-core` installed to actually run the
  modules. `testing/.venv` is a dedicated venv for exactly this (gitignored —
  not committed), created with:
  ```sh
  uv venv --python 3.13 testing/.venv
  uv pip install --python testing/.venv 'pyobs-core[full]==2.0.0.dev53'
  ```
  Recreate it the same way if it's missing or you need a newer pinned
  version. Every verification in this doc used it:
  ```sh
  testing/.venv/bin/pyobs testing/pyobs-gui-configs/xmpp/roof.yaml
  ```

## Running the client itself

1. `npm run dev` (see `README.md`).
2. `.env.local` needs `VITE_XMPP_WS_URL=ws://localhost:5281/ws` for a local
   ejabberd without a valid TLS cert — otherwise the client defaults to
   `wss://`. Vite only reads env files at startup; restart after changing.
3. On the login page, **uncheck "Force secure WebSocket"** before
   connecting. It defaults to checked for any domain the client hasn't seen
   before, which rewrites the `ws://` override from `.env.local` back to
   `wss://` and breaks the connection with `net::ERR_CONNECTION_RESET` —
   this bit the first attempt at this. It remembers your choice per-domain
   (`useServerConfig`) after that.
4. Log in as `admin@localhost` / `pyobs` (or whatever account you're using —
   the ACL test configs below assume `admin`, see their header comments if
   you log in as something else).

## Worked example: verifying `EventsView.vue`

This is the exact sequence used to manually verify `specs/design/events-page.md`
against a live backend:

```sh
# terminal 1 — a module to generate events
testing/.venv/bin/pyobs testing/pyobs-gui-configs/xmpp/roof.yaml

# terminal 2 — the client
npm run dev
```

Log in as `admin@localhost` / `pyobs` (remember to uncheck "Force secure
WebSocket" first). The Dashboard should show `roof` online. Open Shell,
select the `roof` module, run `IRoof.init` — this fires
`MotionStatusChangedEvent` (twice: `initializing`, then `idle`) and
`RoofOpenedEvent`. Open Events and confirm they showed up, `LogEvent`
excluded.

## Fixed: event/log "Sender" column showing `pubsub.localhost`

Earlier testing in this project reported every event's Sender column
(`EventsView.vue`, `LoggingView.vue`'s module filter) showing
`pubsub.localhost` instead of the real module name, and initially
misdiagnosed this as `useXmpp.ts` reading the wrong attribute — it wasn't.
**Live pushes always carried the correct `from` (the module's own bare
JID)**; `Strophe.getNodeFromJid(message.getAttribute('from'))` was correct
the whole time. Confirmed by instrumenting the handler directly: the same
event `uuid` arrived twice in one test, once as a live push
(`from='roof@localhost'`, correct) and once moments later
(`from='pubsub.localhost'`, wrong) — which pointed at the real cause.

**Root cause**: ejabberd resends an event node's last-published ("current")
item on every new subscription — which happens on every reconnect, i.e.
every page load — and that resend arrives attributed to the pubsub service
itself, not the original publisher. Only the initial retained-item replay
is mislabeled; anything that fires while already connected was never wrong.

**Fix, in `useXmpp.ts`**: rather than trust that replay's `from`,
`fetchModuleInfo`'s subscribe loop now also fires a targeted
`pubsub#items get` (`fetchCurrentEventItem`) addressed directly to the
module's own bare JID right after subscribing — since the caller already
knows which module it just asked, there's no `from` to get wrong. This
races the (possibly mis-attributed) auto-push; `upsertEvent` resolves the
race by `uuid`, keeping whichever copy has a real module identity regardless
of arrival order.

**Residual, understood and left as-is**: a node's *current* item can be
corrected this way, but an item that was already stale by the time this fix
shipped — since replaced as "current" by something newer — has no live data
left to re-fetch, so it keeps showing `pubsub.localhost` forever. Harmless
in practice (it's dead history, not live state), and self-resolves the next
time that node's value actually changes.
