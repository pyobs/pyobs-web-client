# Plan: Android home-screen widgets for pyobs-weather instances

Status: implemented 2026-09-29, verified on an Android 14 device. Open: Android < 12 untested, picker
preview PNGs for < 12.

Repos: pyobs-web-client only. No pyobs-weather changes (Tim, 2026-09-28).

## Context

Native Android home-screen widgets showing pyobs-weather instances the user has linked in the app:
current temperature / humidity / wind, a condition icon (clear / partly cloudy / cloudy / rain,
day or night), the site's overall good/bad flag, and the data age.

Three widget styles, each its own entry in the launcher's widget picker. When placing one, the
user picks which sites it shows, so e.g. a tiles widget with MONET/N + MONET/S and a detailed one
with only IAG 50cm can sit side by side.

Not an XMPP widget. Home-screen widgets are drawn by the launcher from `RemoteViews`; no WebView,
none of the app's JS, no XMPP session. The widgets talk HTTP to pyobs-weather directly.

Mockups (styles A, B, D, condition icons, edge states):
https://claude.ai/artifact/KEQqEkHvesWGmUDuR6C2jX (private, owner only).

### What pyobs-weather already gives us (checked live 2026-09-28)

- `GET <url>/api/current/` (`pyobs_weather/api/views.py:137`) is public and returns
  `{time, good, sensors: {<type_code>: {value, good}}}` for the average station. Per-sensor `good`
  is often `null`; top-level `good` is always set.
- `GET <url>/api/config/` returns `site` (e.g. "50cm @ IAG") and `value_types` with units.
- `GET <url>/api/sensors/` returns every sensor with `unit` and `limits`
  (`[{type: "danger"|"warning", min?, max?}]`), but for all stations. The average station's code is
  configurable (`INFLUXDB_MEASUREMENT_AVERAGE`: `average` at MONET/S, `iag50cm_avg` at IAG) and
  not exposed by any endpoint. Its `station_name` is always "Average values" (set by
  `initweather.py:17`), which is the only way to pick it out today.

Live values:

| Instance | skytemp | rain | windspeed unit | skytemp limits |
|---|---|---|---|---|
| weather.monet.saao.ac.za | −25.8 °C | 0 (unit `0/1`) | km/h | danger ≥ −20, warning −25 to −20 |
| weather.iag50srv.astro.physik.uni-goettingen.de | missing (to be added) | 0 | km/h | n/a |
| MONET/N | no pyobs-weather instance yet | | | |

### What web-client already has

- `src/composables/useLinkedApps.ts`: per-bare-JID list of `{label, url, icon?}` in `localStorage`,
  seeded with `https://weather.<domain>`. No marker for "this is a weather instance".
- Capacitor 8 Android shell, `org.pyobs.app`, Java (`MainActivity.java` is a bare
  `BridgeActivity`), minSdk 24, JUnit already wired for `android/app/src/test`.
- iOS isn't built yet (mobile-first redesign phase 4, blocked on Mac access), so this plan is
  Android only. A WidgetKit version would be a separate plan.

## Decisions

- **Three widget styles** (Tim, 2026-09-28), from the mockups:
  - **A · List**: one row per site (icon, label, humidity · wind, temperature, OK/BAD).
  - **B · Tiles**: one tile per site in a row (label, icon, OK/BAD, temperature, humidity, wind,
    age).
  - **D · Detailed**: per site a header row plus humidity / wind / sky-temperature chips; chips
    whose value is inside the site's `warning` or `danger` range are highlighted.

  Each style is its own `AppWidgetProvider`, so each shows up separately in the widget picker with
  its own preview. They share fetching, caching, refresh and classification; only layout code
  differs.
- **Sites are chosen per widget**: a configuration activity opens when a widget is placed and asks
  which weather instances it shows (checkbox list, order as listed in the app). Stored per
  `appWidgetId`. This replaces a global "show in widget" setting; hiding e.g. iagvt (~10 m from
  iag50) is just not ticking it.
- **Layout adapts to widget size**. Sizes reported by Tim's Motorola launcher (Android 14, 4-column
  grid), two per widget (portrait/landscape), the smaller one is what the layout must fit:

  | Widget | Reported size (dp) |
  |---|---|
  | 4×1 | 409 × 91 to 94 |
  | 4×2 | 409 × 181 to 188 |
  | 4×3 | 409 × 272 to 282 |

  The widgets actually render a bit taller than reported (a 4×2 is ~225 dp on screen), so entries
  share the height by weight instead of using fixed heights. List rows switch to a large variant
  (bigger text, condition + sky line) at 72 dp or more per row. Tiles switch to a compact form
  (icon, temperature, OK/BAD dot, name; humidity and wind on the right when a tile is ≥ 170 dp wide)
  below 120 dp of tile height, which makes 4×1 and 2×1 tiles widgets work. Below 96 dp total height
  the header (title, refresh, choose sites) is dropped. When more sites are selected than fit, the
  header shows "+N" rather than squeezing. B wraps to a second row when the widget is tall enough.
- **Label** is the linked app's `label` (short, user controlled), not pyobs-weather's `site`
  ("MONET/S @ SAAO" doesn't fit a ~110 dp tile). A link still carrying the seeded "Weather" label is
  shown under its saved connection's name ("MONET/S", "IAG 50cm"); host name if the label is empty.
- **Condition rules** (Tim, 2026-09-28): rain from `rain`, clear/cloudy from `skytemp`.
  Thresholds come from the site's own pyobs-weather limits, not an app setting:
  1. `rain` inside its `danger` range → **rain**. No limits → `rain > 0`.
  2. else `skytemp` inside `danger` → **cloudy**, inside `warning` → **partly cloudy**, else
     **clear**.
  3. no `skytemp` value, or no skytemp limits → **sky unknown** (grey cloud with a question mark
     beside it, "No sky sensor"; Tim picked it over a thermometer, which read as "temperature").
  4. `sunalt < 0` → night variant (moon instead of sun) for clear / partly cloudy.
- **OK/BAD** is pyobs-weather's top-level `good`. Per-sensor warning highlighting only in D.
- **Refresh**: WorkManager periodic work every 15 min, plus tap-to-refresh (Tim: 15 to 30 min is
  enough). One job refreshes every instance used by any widget. No push.
- **Candidate instances**: linked apps with `kind: 'weather'`, across all accounts stored on the
  device, de-duplicated by normalized URL. Adds a `kind` field instead of matching the editable
  label.
- **Average station found by name, no pyobs-weather change** (Tim, 2026-09-28): units and limits
  come from `/api/sensors/`, rows with `station_name == "Average values"`. Two requests per
  instance per refresh (`current` + `sensors`); fine at a 15 min interval. If a site ever renames
  that station, its entries fall back to "no limits" (rules 1 and 3 above), not to an error.
- **All three styles ship together** (Tim, 2026-09-28).
- **Java, not Kotlin**: matches `MainActivity.java`, avoids adding the Kotlin Gradle plugin just for
  this. Plain `RemoteViews` (Glance would need Kotlin + Compose). The configuration activity is
  native too, not a WebView route: it must be its own activity, and it's a checkbox list.
- **No extra HTTP/JSON deps**: `HttpURLConnection` + `org.json`, both in the platform. Only new
  dependency is `androidx.work:work-runtime`.

## Phases

### Phase 1: linked apps get a `kind`

- [x] `LinkedApp` gets `kind?: 'weather' | 'other'`
- [x] `seedDefaults()` sets `kind: 'weather'` on the weather entry
- [x] one-time migration in `loadStore()`: entries without `kind` whose host starts with
  `weather.` get `kind: 'weather'`, the rest `'other'`. Runs once, then the stored value wins
- [x] link editor in `SettingsView.vue`: a "Weather instance" toggle (or kind select)
- [x] unit tests for the migration and the seed

### Phase 2: bridge the instance list to native

The widgets can't read WebView `localStorage`, so the app pushes the candidate list to native
storage.

- [x] local Capacitor plugin `WeatherWidgetPlugin` (Java, registered in `MainActivity.onCreate`
  via `registerPlugin(...)` before `super.onCreate`): `setInstances({instances: [{url, label}]})`
  writes JSON to `SharedPreferences` (refreshing the widgets from here comes with phase 5)
- [x] TS side (`src/native/weatherWidget.ts`): `registerPlugin('WeatherWidget')`, no-op unless
  `Capacitor.getPlatform() === 'android'`
- [x] call it whenever the linked-apps store changes (watch in `useLinkedApps.ts`, or wherever
  `persist()` runs), with all `kind: 'weather'` entries across every JID, deduped by URL
- [x] also call it once on app start, so a fresh install / upgrade gets populated without editing a
  link

Instances are keyed by normalized URL everywhere (candidate list, per-widget selection, cache), so
renaming a link updates every widget and deleting one drops it from every widget.

Consequence: the configuration activity only lists instances after the app has run once. It shows
"Open pyobs to add a weather link" (button opens the app) when the list is empty.

### Phase 3: fetch, cache, classify (native, pure Java, unit-tested)

- [x] `WeatherFetcher`: per instance, `GET api/current/` and `GET api/sensors/` (URLs joined
  against the stored base URL, so `root_url` sub-paths work). Units and limits from the
  `api/sensors/` rows with `station_name == "Average values"`
- [x] `WeatherCondition.classify(sensors, limits, sunalt)` → `RAIN | CLOUDY | PARTLY_CLOUDY |
  CLEAR | DRY`, plus night flag. Pure function
- [x] `SensorLevel.of(value, limits)` → `OK | WARNING | DANGER`, for D's chip highlighting. Pure
  function
- [x] units from the API, never hard-coded (all sites use km/h today, don't rely on it)
- [x] 10 s connect/read timeouts; one failing instance doesn't block the others
- [x] cache last good result per instance in `SharedPreferences`, so a failed fetch shows old data
  with its age instead of a blank entry
- [x] `WeatherRefreshWorker`: fetches the union of instances selected by any placed widget, then
  updates all three providers. Periodic 15 min, `NetworkType.CONNECTED`, unique work so it isn't
  enqueued twice. Enqueued when the first widget of any style is placed, cancelled when the last
  one is removed (`WeatherRefresh.schedule` / `cancel`; the provider hooks and "update all
  providers" come with phase 5)
- [x] `WeatherWidgetPlugin.setInstances` also triggers a one-off refresh (checked on device: both
  instances fetched and cached). Skipped while no widget is placed, so app start doesn't fetch for
  nothing

### Phase 4: widget configuration

- [x] `WeatherWidgetConfigureActivity`: checkbox list of candidate instances (label + URL), "Add
  widget" button, returns `RESULT_OK` with the `appWidgetId`; `RESULT_CANCELED` on back so the
  launcher drops the widget
- [x] per-widget selection in `SharedPreferences` under `widget_<appWidgetId>`; cleared in each
  provider's `onDeleted`
- [x] shared by all three providers (`android:configure` in each provider's info XML)
- [x] reconfigure: `android:widgetFeatures="reconfigurable"` (Android 12+, long-press → settings).
  Below 12 there's no launcher entry point, so a small gear in the widget header opens the same
  activity
- [x] selected instance later deleted in the app: drop it from the widget; none left → empty state

### Phase 5: the three widgets

Common:

- [x] three providers (`WeatherListWidget`, `WeatherTilesWidget`, `WeatherDetailedWidget`) with
  their own `res/xml/wx_widget_*.xml` (resizable, `updatePeriodMillis=0`), sharing
  `WeatherWidgetProvider` + `WeatherWidgets` (rendering)
- [x] picker previews via `previewLayout` (Android 12+), generated from the real layouts with sample
  data by `android/scripts/gen_weather_widget_previews.py`; re-run after changing a `wx_*` layout
- [ ] `previewImage` PNGs for Android < 12 (they show the app icon for now)
- [x] size handling: Android 12+ via `new RemoteViews(Map<SizeF, RemoteViews>)` (launcher picks
  per size); API 24 to 30 by reading `OPTION_APPWIDGET_MIN_WIDTH` / `MAX_HEIGHT` in
  `onAppWidgetOptionsChanged` and rebuilding
- [x] entries built with `RemoteViews.removeAllViews` / `addView` (works on API 24; no
  `RemoteViewsService` for what's at most a handful of entries); "+N" when more are selected than
  fit
- [x] stale data (age > 1 h) shown greyed, so an old "clear" doesn't read as current
- [x] fetch error with no cache: entry shows the label and "unreachable" (offline icon)
- [x] vector drawables for the 5 conditions + night variants + offline, both themes (day/night
  resources)
- [x] tap on an entry opens that instance's URL in the browser; refresh button enqueues a one-off
  work request
- [x] refresh feedback (found testing in airplane mode, 2026-09-29): the one-off refresh doesn't wait
  for a network (the periodic job still does), the header shows "Updating…" right after a tap and
  "Update failed · <age>" in orange when the last attempt didn't get through; cached values stay
- [x] manifest: three receivers, the configure activity, `INTERNET` (already present for the app,
  verify)

Per style (layouts as in the mockups):

- [x] A · List: rows in a vertical `LinearLayout`, header with title + refresh
- [x] B · Tiles: weighted horizontal `LinearLayout` of tiles; second row when height allows
- [x] D · Detailed: per-site block with header row and 3 chips (humidity, wind, sky); chip
  background from `SensorLevel`; sky chip "n/a" without a sensor

### Phase 6: verify

- [x] JUnit for `WeatherCondition`, `SensorLevel`, JSON parsing (fixtures from the live responses
  above, plus a `/api/sensors/` response without an "Average values" station)
- [x] Vitest for phases 1 and 2 (TS side)
- [x] real device (Tim, Motorola edge 50 neo, Android 14, 2026-09-29): all three styles, resize
  through the size table (corrected above from measured sizes), reconfigure, remove a linked app
  while a widget shows it, airplane mode, dark mode, reboot
- [ ] Android < 12 (the pre-12 size-handling path, no picker preview): untested, no device or
  emulator image available
- [x] web build unaffected (plugin call is a no-op off Android)

## Open questions

- Cleartext HTTP: Android blocks `http://` by default (targetSdk 36). iagvt's link is
  `http://weather.iagvtsrv`, so it would always show "unreachable" unless it moves to https or the
  app gets a network security config allowing that host.
- pyobs-weather's `Switch` evaluator seems to report its danger band on the wrong side in `areas()`
  (danger `max: threshold` while it's bad at `value >= threshold` without `invert`). Not verified on
  a live instance; a sensor using it would get the wrong level in the widgets.
