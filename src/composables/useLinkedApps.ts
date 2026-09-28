import { ref, computed, watch } from 'vue'
import { Strophe } from 'strophe.js'
import { useXmpp } from '@/composables/useXmpp'
import { syncWeatherInstances } from '@/native/weatherWidget'

// Plain external links to other pyobs web apps (web-admin/portal/weather, or anything a site
// wants to add) — see specs/design/embedded-app-auth.md (issue #48). No auth mechanism of its
// own: the browser owns SSO once the link is a real external navigation, so this composable is
// just an editable list, same shape as useVfsConfig.ts's endpoints (localStorage, per-account,
// plain CRUD) minus the secret-handling half (nothing here is sensitive).
export type LinkedApp = {
  label: string
  url: string
  icon?: string
  // 'weather' marks a pyobs-weather instance, the candidate list for the Android home-screen
  // widgets (specs/plans/2026-09-28-android-weather-widget.md). An explicit field rather than
  // matching the label, which the user can edit freely.
  kind?: LinkedAppKind
}

export type LinkedAppKind = 'weather' | 'other'

const LINKED_APPS_KEY = 'pyobs_linked_apps'

// Keyed by bare JID — same reasoning as VFS endpoints: different accounts on the same install may
// want different links (different fleet, different domain).
export type LinkedAppsStore = Record<string, LinkedApp[]>

// Best guess for entries stored before `kind` existed: the seeded weather link, and any site
// following the same `weather.<domain>` naming, is a pyobs-weather instance.
export function guessKind(url: string): LinkedAppKind {
  try {
    return new URL(url).hostname.startsWith('weather.') ? 'weather' : 'other'
  } catch {
    return 'other'
  }
}

// One-time backfill of `kind` for entries stored before it existed. Every entry comes out with a
// `kind`, so once written back this never guesses again and the user's choice wins.
export function migrateLinkedApps(store: LinkedAppsStore): { store: LinkedAppsStore; changed: boolean } {
  let changed = false
  const next: LinkedAppsStore = {}
  for (const [bareJid, apps] of Object.entries(store)) {
    next[bareJid] = apps.map((app) => {
      if (app.kind) return app
      changed = true
      return { ...app, kind: guessKind(app.url) }
    })
  }
  return { store: next, changed }
}

function loadStore(): LinkedAppsStore {
  let raw: unknown
  try {
    raw = JSON.parse(localStorage.getItem(LINKED_APPS_KEY) ?? '{}')
  } catch {
    return {}
  }
  if (!raw || typeof raw !== 'object') return {}
  const { store, changed } = migrateLinkedApps(raw as LinkedAppsStore)
  if (changed) localStorage.setItem(LINKED_APPS_KEY, JSON.stringify(store))
  return store
}

const store = ref<LinkedAppsStore>(loadStore())

function persist(bareJid: string, apps: LinkedApp[]): void {
  store.value = { ...store.value, [bareJid]: apps }
  localStorage.setItem(LINKED_APPS_KEY, JSON.stringify(store.value))
  void syncWeatherInstances(store.value)
}

// Called once at app start (main.ts), so the widgets get the current list after an install or
// upgrade without the user having to touch a link first.
export function syncWeatherWidgets(): Promise<void> {
  return syncWeatherInstances(store.value)
}

// Domain-guessed defaults, confirmed against real fleet deployments (see the design doc's
// "Extended" section) — pre-filled, never silently trusted: the user sees and can edit/delete
// every one of these like any other entry the moment they're seeded.
function seedDefaults(bareJid: string, domain: string): void {
  persist(bareJid, [
    { label: 'Weather', url: `https://weather.${domain}`, icon: `https://weather.${domain}/favicon.ico`, kind: 'weather' },
    { label: 'Portal', url: `https://observe.${domain}`, icon: `https://observe.${domain}/favicon.ico`, kind: 'other' },
    { label: 'Web Admin', url: `https://admin.${domain}`, icon: `https://admin.${domain}/favicon.ico`, kind: 'other' },
  ])
}

export function useLinkedApps() {
  const { jid } = useXmpp()
  const bareJid = computed(() => (jid.value ? (Strophe.getBareJidFromJid(jid.value) ?? '') : ''))

  // First time this account's ever been seen (no stored entry at all, not even an empty array
  // from a user who deleted everything) — seed the three known defaults. A watcher, not a
  // side effect inside the computed below, so `linkedApps` stays a pure read of `store`.
  watch(
    bareJid,
    (value) => {
      if (!value || store.value[value]) return
      const domain = Strophe.getDomainFromJid(value)
      if (domain) seedDefaults(value, domain)
    },
    { immediate: true },
  )

  const linkedApps = computed<LinkedApp[]>(() => (bareJid.value ? (store.value[bareJid.value] ?? []) : []))

  function addLink(app: LinkedApp): void {
    if (!bareJid.value) return
    persist(bareJid.value, [...linkedApps.value, app])
  }

  function updateLink(index: number, app: LinkedApp): void {
    if (!bareJid.value) return
    const next = [...linkedApps.value]
    next[index] = app
    persist(bareJid.value, next)
  }

  function removeLink(index: number): void {
    if (!bareJid.value) return
    persist(
      bareJid.value,
      linkedApps.value.filter((_, i) => i !== index),
    )
  }

  return { linkedApps, addLink, updateLink, removeLink }
}
