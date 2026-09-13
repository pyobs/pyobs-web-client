import { ref, computed, watch } from 'vue'
import { Strophe } from 'strophe.js'
import { useXmpp } from '@/composables/useXmpp'

// Plain external links to other pyobs web apps (web-admin/portal/weather, or anything a site
// wants to add) — see specs/design/embedded-app-auth.md (issue #48). No auth mechanism of its
// own: the browser owns SSO once the link is a real external navigation, so this composable is
// just an editable list, same shape as useVfsConfig.ts's endpoints (localStorage, per-account,
// plain CRUD) minus the secret-handling half (nothing here is sensitive).
export type LinkedApp = {
  label: string
  url: string
  icon?: string
}

const LINKED_APPS_KEY = 'pyobs_linked_apps'

// Keyed by bare JID — same reasoning as VFS endpoints: different accounts on the same install may
// want different links (different fleet, different domain).
type LinkedAppsStore = Record<string, LinkedApp[]>

function loadStore(): LinkedAppsStore {
  try {
    const raw = JSON.parse(localStorage.getItem(LINKED_APPS_KEY) ?? '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

const store = ref<LinkedAppsStore>(loadStore())

function persist(bareJid: string, apps: LinkedApp[]): void {
  store.value = { ...store.value, [bareJid]: apps }
  localStorage.setItem(LINKED_APPS_KEY, JSON.stringify(store.value))
}

// Domain-guessed defaults, confirmed against real fleet deployments (see the design doc's
// "Extended" section) — pre-filled, never silently trusted: the user sees and can edit/delete
// every one of these like any other entry the moment they're seeded.
function seedDefaults(bareJid: string, domain: string): void {
  persist(bareJid, [
    { label: 'Weather', url: `https://weather.${domain}`, icon: `https://weather.${domain}/favicon.ico` },
    { label: 'Portal', url: `https://observe.${domain}`, icon: `https://observe.${domain}/favicon.ico` },
    { label: 'Web Admin', url: `https://admin.${domain}`, icon: `https://admin.${domain}/favicon.ico` },
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
