import { ref, computed, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Strophe } from 'strophe.js'
import {
  PushNotifications,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from '@capacitor/push-notifications'
import { useXmpp } from '@/composables/useXmpp'
import type { CommandSchema } from '@/pyobs-codec'

// Native-only (Android/iOS) — push notifications need a real device
// registration (FCM/APNs), no meaningful web equivalent for this app; a
// no-op everywhere else. This is the feasibility spike itself
// (specs/design/native-app-shell-capacitor.md's "Push notifications"
// section, phase 3, "Test this early"), not the full alerting feature —
// there is no server/relay yet that sends anything meaningful to the token
// this obtains. What this proves: permission prompts work, a real FCM/APNs
// token comes back, and a manually-sent test push (e.g. from the Firebase
// console) is received and logged.
//
// Registration is deliberately independent of XMPP login state — a device
// token is a property of the device/app install, not of which pyobs account
// happens to be logged in at the moment; associating a token with an
// account server-side is a later, not-yet-designed step.

const token = ref<string | null>(null)
const registrationError = ref<string | null>(null)
const lastReceived = ref<PushNotificationSchema | null>(null)

let initialized = false

// Associates this device's token with a server-side IPushNotifications module
// (PushNotifier, pyobs-core#902/specs/design/push-notification-module.md),
// once both exist. Same "implements-it-or-not" conditional pattern as every
// other optional interface in this app (e.g. IDataSequence) — no module
// advertising IPushNotifications in the connected roster means this never
// fires, no error, no assumption the module exists. Registration is
// idempotent server-side (upserted, keyed by caller JID + token), so
// re-firing on every reconnect is harmless; registeredWith dedupes it anyway
// to avoid redundant RPCs. A failed attempt is evicted so a later reconnect
// (the next time `modules` changes) retries it — no dedicated retry loop,
// matching the "small addition" scope this was designed as.
const registeredWith = new Set<string>()
const { modules: pushModules, executeMethod: pushExecuteMethod, jid: xmppJid } = useXmpp()
watch(
  [pushModules, token],
  ([mods, t]) => {
    if (!t) return
    for (const mod of mods) {
      const schema = mod.interfaces['IPushNotifications']?.commands['register_push_device'] as CommandSchema | undefined
      if (!schema) continue
      const key = `${mod.jid}:${t}`
      if (registeredWith.has(key)) continue
      registeredWith.add(key)
      const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
      const values: Record<string, unknown> = { token: t, platform }
      const params = schema.params.map((p) => values[p.name] ?? null)
      void pushExecuteMethod(mod.fullJid, 'register_push_device', params, schema).then((result) => {
        if (!result.success) registeredWith.delete(key)
      })
    }
  },
  { immediate: true },
)

// ── per-user notification-type preferences (pyobs-web-client#57) ─────────────
//
// Filtering has to happen server-side (pyobs-core's PushNotifier,
// specs/design/push-notification-module.md §6) — the app runs no code while
// closed, so the system tray shows whatever FCM delivered regardless of what
// this composable thinks. This side reads the account's selection on connect
// and writes it on toggle. Keyed by bare JID: one account's preference applies
// to every device it registered, so reading get_push_preferences on connect is
// what keeps a second device in sync (a local-only copy could not see it).

const PUSH_PREFS_KEY = 'pyobs_push_preferences'

// localStorage cache of the last-known selection, per account — only a seed, so the toggles
// don't flash all-on while the getter round-trip is in flight. The authoritative value always
// comes from get_push_preferences.
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

const bareJid = computed(() => (xmppJid.value ? (Strophe.getBareJidFromJid(xmppJid.value) ?? '') : ''))

// Full set of kinds the connected PushNotifier advertises, or [] when there's no v2 module
// (a v1 module has register_push_device but no preference commands / enum).
const notificationTypes = computed<string[]>(() => {
  for (const mod of pushModules.value) {
    const iface = mod.interfaces['IPushNotifications']
    if (!iface?.commands['set_push_preferences']) continue
    const types = iface.enums['PushNotificationType']
    if (types?.length) return [...types] // copy: `modules` is DeepReadonly
  }
  return []
})

// A v2 module exposing get_push_preferences, or undefined when none is connected yet.
const pushPrefsModule = computed(() =>
  pushModules.value.find((m) => m.interfaces['IPushNotifications']?.commands['get_push_preferences']),
)

// The selection read back from the server (or set optimistically on toggle) for the current
// account. null until either happens; `preferences` then falls back to the cache, then all-on.
const fetchedPreferences = ref<string[] | null>(null)
watch(bareJid, () => {
  fetchedPreferences.value = null // a different account's value comes from its own getter
})

const preferences = computed<string[]>(() => {
  if (fetchedPreferences.value !== null) return fetchedPreferences.value
  const cached = bareJid.value ? prefsStore.value[bareJid.value] : undefined
  return cached ?? notificationTypes.value
})

function cachePreferences(jid: string, types: string[]): void {
  prefsStore.value = { ...prefsStore.value, [jid]: types }
  localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(prefsStore.value))
}

// Read the account's current selection. Guarded so a reply that lands after an account switch
// can't write into the wrong account's state. Takes the RPC pieces rather than the module
// because `modules` is DeepReadonly (see useXmpp); the schema is cast the same way the
// register watcher above does.
async function refreshPreferences(fullJid: string, schema: CommandSchema): Promise<void> {
  const jid = bareJid.value
  if (!jid) return
  const result = await pushExecuteMethod(fullJid, 'get_push_preferences', [], schema)
  if (!result.success || !Array.isArray(result.value) || jid !== bareJid.value) return
  const list = result.value as string[]
  fetchedPreferences.value = list
  cachePreferences(jid, list)
}

// Read on connect (and whenever the account changes) — deliberately never a write, so a fresh
// launch can't clobber a preference another device of the same account set.
watch(
  [pushPrefsModule, bareJid],
  ([mod]) => {
    const schema = mod?.interfaces['IPushNotifications']?.commands['get_push_preferences'] as
      | CommandSchema
      | undefined
    if (mod && schema) void refreshPreferences(mod.fullJid, schema)
  },
  { immediate: true },
)

// Write on toggle. Only ever called from the UI, so unlike register_push_device's watcher there
// is nothing to dedupe against module-list churn.
function setTypeEnabled(type: string, enabled: boolean): void {
  const mod = pushPrefsModule.value
  const schema = mod?.interfaces['IPushNotifications']?.commands['set_push_preferences'] as
    | CommandSchema
    | undefined
  const jid = bareJid.value
  if (!mod || !schema || !jid) return

  const current = new Set(preferences.value)
  if (enabled) current.add(type)
  else current.delete(type)
  const next = notificationTypes.value.filter((t) => current.has(t)) // preserve advertised order

  fetchedPreferences.value = next // optimistic
  cachePreferences(jid, next)

  // schema.params[0].type is array<enum(PushNotificationType)>; params = [next]
  void pushExecuteMethod(mod.fullJid, 'set_push_preferences', [next], schema).then((result) => {
    // A failed write must not leave the UI claiming a selection the server never took.
    if (result.success) return
    const getSchema = mod.interfaces['IPushNotifications']?.commands['get_push_preferences'] as
      | CommandSchema
      | undefined
    if (getSchema) void refreshPreferences(mod.fullJid, getSchema)
  })
}

export function usePushNotifications() {
  async function initialize(): Promise<void> {
    if (initialized || !Capacitor.isNativePlatform()) return
    initialized = true

    // PushNotifications.register() calls FirebaseMessaging.getInstance()
    // natively (Android) — without a real google-services.json, that's an
    // uncaught IllegalStateException on a Capacitor plugin thread that
    // crashes the whole app, not something a JS try/catch can reach.
    // Confirmed live on-device. Skip the whole flow (permission prompt
    // included — nothing it would unlock yet) until Firebase is actually
    // configured; see vite.config.ts's __PUSH_NOTIFICATIONS_CONFIGURED__.
    if (!__PUSH_NOTIFICATIONS_CONFIGURED__) {
      registrationError.value = 'Not configured yet (google-services.json missing) — see specs/design/native-app-shell-capacitor.md'
      return
    }

    try {
      let permission = await PushNotifications.checkPermissions()
      if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
        permission = await PushNotifications.requestPermissions()
      }
      if (permission.receive !== 'granted') {
        registrationError.value = `Push permission ${permission.receive}`
        return
      }

      PushNotifications.addListener('registration', (t: Token) => {
        token.value = t.value
        registrationError.value = null
      })
      PushNotifications.addListener('registrationError', (err) => {
        registrationError.value = err.error || 'Push registration failed'
      })
      // Spike-level handling only: confirm delivery and surface it for
      // manual inspection. No routing/display logic yet — that depends on
      // the not-yet-designed server-side alerting this is meant to unblock.
      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        lastReceived.value = notification
      })
      PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
        lastReceived.value = action.notification
      })

      await PushNotifications.register()
    } catch (e) {
      registrationError.value = String(e)
    }
  }

  return { token, registrationError, lastReceived, initialize, notificationTypes, preferences, setTypeEnabled }
}
