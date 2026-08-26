pyobs-web-client
#################

This is a `pyobs <https://www.pyobs.org>`_ (`documentation <https://docs.pyobs.org>`_) GUI client
for telescope fleets, written in TypeScript/Vue 3. It talks the pyobs XMPP wire protocol directly
from the browser (Strophe.js) — there is no backend of its own and nothing to install into a
fleet's own ``class:``-configured module list; you build it and serve the static output, then log
in from the browser.


Example configuration
**********************

There's no module-side YAML config — this is a static single-page app a browser connects with.
What you configure instead:

Server-side, the ejabberd server this client connects to needs its WebSocket listener enabled and
mapped to ``/ws`` (`ejabberd docs
<https://docs.ejabberd.im/admin/configuration/listen/#websocket>`_)::

    listen:
      -
        port: 5280
        ip: "::"
        module: ejabberd_http
        tls: false
        request_handlers:
          /ws: ejabberd_http_ws
          /admin: ejabberd_web_admin

By default the app connects to ``ws(s)://<jid-domain>:5280/ws``, derived from the JID a user logs
in with — no build-time server address needed. Override it only if that default doesn't resolve
(e.g. a dev server on plain ``http://`` against a TLS-only ejabberd listener), via a build-time
env var in ``.env.local``::

    VITE_XMPP_WS_URL=wss://localhost:5280/ws

At runtime, a user logs in with a JID + password against whichever server that resolves to; the
app remembers previous logins and per-connection VFS endpoint config locally — nothing further to
configure ahead of time.


Views
*****

One router view per top-level page (``src/router/index.ts`` / ``src/views/*.vue``). No
screenshots yet — written from source, not a running instance; add those as a follow-up.

DashboardView
=============
The landing page: an expandable list of every currently-online module, generic capability/state
cards (``ModuleStateCard``/``KeyValueCard``) with no per-interface hardcoding.

ShellView
=========
A pyobs-gui-style RPC console — accordion-style module/method/params picker built from each
module's own live command schema, plus a log of executed commands and their replies. The one
generic escape hatch for any RPC any connected module exposes, including ones without a dedicated
page below.

RoofView
========
Drives ``IRoof`` — status readout plus Open/Close/Stop for every currently-online module
implementing it.

ModeView
========
Drives ``IMode``.

WeatherView
===========
Drives ``IWeather`` — includes a hand-rolled ``TimeSeriesChart`` for sensor history.

AutoFocusView
=============
Drives ``IAutoFocus`` — includes a hand-rolled ``FocusCurveChart`` scatter chart.

AutoGuidingView
===============
Drives ``IAutoGuiding`` — includes hand-rolled ``OffsetMagnitudeChart``/``OffsetScatterChart``
charts.

AcquisitionView
===============
Drives ``IAcquisition`` — includes a hand-rolled ``DistanceChart``, reusing
``OffsetScatterChart`` from AutoGuiding for the offset trajectory.

CameraView
==========
Drives ``ICamera`` — Expose button, live ``IExposure`` state, and client-side FITS decode/render
(``packages/pyobs-fits``, a hand-rolled decoder) of the grabbed image, plus a collapsible settings
panel for ``IWindow``/``IBinning``/``IImageFormat``/``IExposureTime``/``IGain``/``IImageType``.

LoggingView
===========
Live ``LogEvent`` stream via versioned event PubSub, with real filtering.

EventsView
==========
Every incoming event, not just ``LogEvent`` — a generic feed for anything a module publishes.

SettingsView
============
Connection settings — saved accounts, VFS endpoint config, "Test connection".
