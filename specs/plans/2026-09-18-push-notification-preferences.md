# Plan: per-user push notification type preferences (web-client)

Status: proposed.

Repos: pyobs-web-client (all implementation here). pyobs-core half is done — `PushNotificationType`
(StrEnum) + `IPushNotifications.register_push_device` / `get_push_preferences` /
`set_push_preferences`, with per-account type filtering enforced at send time (all-on default).
This plan is the companion: the toggle UI plus the get/set preference calls, closing
pyobs-web-client#57.

Issues: pyobs-web-client#57 (originating); pyobs-core#902 (module tracking).

## Context

`src/composables/usePushNotifications.ts` already registers the device token once a
`IPushNotifications` module and a token both exist (`register_push_device`, keyed by
`mod.interfaces['IPushNotifications'].commands['register_push_device']`). It is still spike-level:
the Settings panel (`SettingsView.vue:256-280`) shows token / error / last-received, nothing else.

pyobs-core's v2 `PushNotifier` now advertises `get_push_preferences()` →
`array<enum(PushNotificationType)>` and `set_push_preferences(types)` with the same wire type, and
the enum values (`module_error`, `log_error`, `log_critical`) in disco#info's `<types>` block. The
client must:

1. render one toggle per advertised type,
2. read the account's current selection on connect (`get_push_preferences`),
3. call `set_push_preferences` on toggle so the server filters pushes while the app is closed (the
   only case that matters — no client code runs in the background).

## Goal

A "Notification types" section in Settings with a checkbox per advertised kind, backed by the
server's per-account selection (read on connect, written on toggle). All-on by default, matching
the server's own default; opting out of everything (empty selection) must be expressible.

## Considered options

**Source of truth.** The server is authoritative: `get_push_preferences` returns the account's
effective selection (all types when never set). **Chosen: read it on connect and render from it**,
so a preference set on another device of the same account shows up here. A small `localStorage`
cache seeds the UI before the getter resolves (avoids a brief all-on flash), but never drives a
write. Rejected: local-only state with re-send-on-reconnect (the pre-getter fallback) — it can't
see sibling-device changes and re-asserting a stale local value would clobber them.

**When to write.** Only on an explicit toggle — **never on connect**. The connect path reads; the
toggle path writes. Rejected: re-sending the cached selection on every reconnect, which would make
two devices last-writer-wins on every launch instead of only when the user actually changes
something.

**Where the code lives.** **Chosen: extend `usePushNotifications.ts`** — it already owns the
`IPushNotifications` module discovery and the `register_push_device` watcher, so the get/set calls
sit right next to it. Rejected: a separate composable, which would duplicate module discovery for
no gain.

**Persistence.** The `localStorage` cache is non-secret per-account config, same pattern as
`useLinkedApps.ts`/`useVfsConfig.ts` (`pyobs_push_preferences`, `Record<bareJid, string[]>`).
Rejected: `@aparajita/capacitor-secure-storage` (for secrets; this isn't one).

**Labels.** The three values aren't snake_case wire param names, so `humanizeParamName()` (#44)
is the wrong tool. **Chosen: a small hand-written map**, mirroring `src/utils/weatherSensorLabel.ts`
(`module_error` → "Module errors", `log_error` → "Error log events", `log_critical` → "Critical
log events"), with the raw value as the fallback so a future kind still renders.

## Decision

### 1. Composable state — `usePushNotifications.ts`

```ts
import { ref, computed, watch } from 'vue'
import { Strophe } from 'strophe.js'

const PUSH_PREFS_KEY = 'pyobs_push_preferences'

// localStorage cache of "last known selection" per account — a seed for the UI before the
// authoritative get_push_preferences round-trip returns, never a source of truth for writes.
type PushPrefsStore = Record<string, string[]>

function loadPrefsStore(): PushPrefsStore {
  try {
    const raw = JSON.parse(localStorage.getItem(PUSH_PREFS_KEY) ?? '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

const prefsStore = ref<PushPrefsStore>(loadPrefsStore())
```

`useXmpp()` is already destructured as `{ modules: pushModules, executeMethod: pushExecuteMethod }`;
add `jid`:

```ts
const { modules: pushModules, executeMethod: pushExecuteMethod, jid: xmppJid } = useXmpp()
const bareJid = computed(() => (xmppJid.value ? (Strophe.getBareJidFromJid(xmppJid.value) ?? '') : ''))
```

### 2. Advertised types + effective selection

```ts
// Full set of kinds the connected PushNotifier advertises, or [] when there's no v2 module
// (a v1 module has register_push_device but no get/set_push_preferences command / enum).
const notificationTypes = computed<string[]>(() => {
  for (const mod of pushModules.value) {
    const iface = mod.interfaces['IPushNotifications']
    if (!iface?.commands['set_push_preferences']) continue
    const types = iface.enums['PushNotificationType']
    if (types?.length) return types
  }
  return []
})

// The account's effective selection. Seeded from the cache (or all-on) and reconciled by
// get_push_preferences on connect.
const preferences = ref<string[]>([])

// A v2 module exposing both get/set, or undefined when none is connected yet.
const pushPrefsModule = computed(() =>
  pushModules.value.find((m) => m.interfaces['IPushNotifications']?.commands['get_push_preferences']),
)
```

### 3. Read on connect

```ts
watch(
  [pushPrefsModule, bareJid],
  ([mod, jid]) => {
    if (!mod || !jid) return
    const schema = mod.interfaces['IPushNotifications']!.commands['get_push_preferences']!
    void pushExecuteMethod(mod.fullJid, 'get_push_preferences', [], schema).then((result) => {
      if (!result.success || !Array.isArray(result.value)) return
      const list = result.value as string[]
      preferences.value = list
      prefsStore.value = { ...prefsStore.value, [jid]: list }
      localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(prefsStore.value))
    })
  },
  { immediate: true },
)
```

`preferences` is also seeded from the cache when `bareJid`/`notificationTypes` first become
available, so the toggles aren't all-on-flickering while the getter is in flight.

### 4. Toggle setter (write)

```ts
function setTypeEnabled(type: string, enabled: boolean): void {
  const mod = pushPrefsModule.value
  const schema = mod?.interfaces['IPushNotifications']?.commands['set_push_preferences']
  if (!mod || !schema || !bareJid.value) return

  const current = new Set(preferences.value)
  if (enabled) current.add(type)
  else current.delete(type)
  const next = notificationTypes.value.filter((t) => current.has(t)) // preserve advertised order

  preferences.value = next
  prefsStore.value = { ...prefsStore.value, [bareJid.value]: next }
  localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(prefsStore.value))

  // schema.params[0].type is array<enum(PushNotificationType)>; params = [next]
  void pushExecuteMethod(mod.fullJid, 'set_push_preferences', [next], schema).then((result) => {
    if (!result.success) {
      // Roll the optimistic update back to the server's (still-authoritative) value.
      // A later get_push_preferences watch fire will re-sync; simplest is to just refetch here.
      return
    }
  })
}
```

The write path is event-driven (only on toggle), so no dedup set is needed — unlike
`register_push_device`, there's no watcher re-firing on module-list churn. The return adds
`{ notificationTypes, preferences, setTypeEnabled }` alongside the existing spike state.

### 5. UI — `SettingsView.vue`

A "Notification types" block above the diagnostic panel (native-only, and only when a v2 module
advertises the enum):

```vue
<div v-if="isNativePlatform && notificationTypes.length > 0" class="pyobs-card" style="font-size:0.8rem">
  <div class="text-muted text-uppercase mb-1" style="font-size:0.65rem; letter-spacing:.06em">Notification types</div>
  <div v-for="type in notificationTypes" :key="type" class="form-check">
    <input
      class="form-check-input"
      type="checkbox"
      :id="`push-type-${type}`"
      :checked="preferences.includes(type)"
      @change="setTypeEnabled(type, ($event.target as HTMLInputElement).checked)"
    />
    <label class="form-check-label text-light" :for="`push-type-${type}`">{{ typeLabel(type) }}</label>
  </div>
</div>
```

with a module-level `TYPE_LABELS` map + `typeLabel()` fallback as above. The block is hidden in the
browser (`isNativePlatform` gate, same as the existing panel) and against a v1 `PushNotifier`
(`notificationTypes` empty).

## Tests

Extend `src/__tests__/usePushNotifications.spec.ts`. The existing `useXmpp` mock (lines 8-10) must
also expose `jid` (a `ref`), since `usePushNotifications` now reads it; the fixture gains the
`get_push_preferences`/`set_push_preferences` command schemas and the `PushNotificationType` enum.

- **No v2 module → no get/set call**, even with a token (mirrors the existing "does nothing without
  IPushNotifications" test).
- **v1 module (has `register_push_device`, no get/set)** → no get/set call.
- **On connect** → `get_push_preferences` is called once, and its returned list becomes
  `preferences` (reconciling e.g. a sibling device's choice).
- **Toggle** → `set_push_preferences` is called with `[[...]]` (the new string array) against the
  `set_push_preferences` schema, and `preferences` is updated.
- **Toggle to empty** → `set_push_preferences` called with `[[]]` (opt out of everything).
- **Failed set** → the optimistic `preferences` update is rolled back / re-fetched.
- **Per-account isolation** — switching `jid` reads/writes a different `prefsStore` cache entry.

## Consequences

- **Good:** filtering is enforced server-side, so it works while the app is closed. The UI is
  schema-driven (enum from disco#info), so a future kind appears as a toggle with no client change
  beyond a label.
- **Good:** connect reads, toggle writes — a device never clobbers a sibling device's preference on
  launch, and multi-device consistency comes from the getter, not last-writer-wins-on-connect.
- **Good:** zero behavior change for anyone who never opens the toggles — nothing is written, and
  the server's all-on default stands.
- **Out of scope:** severity thresholds and module allow/deny lists (still core-deferred); the
  #44 humanize/label pass (this plan's three labels are local, not a new shared helper).

## Docs

- Update `specs/design/native-app-shell-capacitor.md`'s "Push notifications" section (lines
  130-149): the "one change this repo will need" note is now *two* — `register_push_device` plus
  the get/set preference calls + toggles; add a line that the v2 preference half landed.
- Add this plan to `specs/plans/index.md`.
- Once implemented, mark pyobs-web-client#57's web-client half done in
  `pyobs-core/specs/steering/fleet-open-items.md`'s #57 row.
