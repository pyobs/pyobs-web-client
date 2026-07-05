import { ref } from 'vue'

const SERVER_CONFIG_KEY = 'pyobs_server_config'

// Keyed by domain, not bare JID — the WS endpoint is a property of the *server*,
// so every user connecting to the same domain wants the same override, unlike VFS
// credentials (useVfsConfig.ts), which can legitimately differ per account.
//
// Only one field: buildWsUrl's one actual guess is the scheme (ws vs wss, inferred
// from window.location.protocol) — port and path are already-fixed constants, not
// inferred. A domain present in this store means "force this scheme instead of
// guessing"; absence means "keep auto-detecting".
type ServerConfigStore = Record<string, boolean> // domain -> forceSecure

function loadStore(): ServerConfigStore {
  try {
    const raw = JSON.parse(localStorage.getItem(SERVER_CONFIG_KEY) ?? '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

const store = ref<ServerConfigStore>(loadStore())

function persist(next: ServerConfigStore): void {
  store.value = next
  localStorage.setItem(SERVER_CONFIG_KEY, JSON.stringify(next))
}

export function useServerConfig() {
  function getForceSecure(domain: string): boolean | undefined {
    return store.value[domain]
  }

  function setForceSecure(domain: string, forceSecure: boolean): void {
    if (!domain) return
    persist({ ...store.value, [domain]: forceSecure })
  }

  function clearOverride(domain: string): void {
    if (!(domain in store.value)) return
    const next = { ...store.value }
    delete next[domain]
    persist(next)
  }

  return { getForceSecure, setForceSecure, clearOverride }
}