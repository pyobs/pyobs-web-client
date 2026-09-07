import { ref } from 'vue'

const SERVER_CONFIG_KEY = 'pyobs_server_config'

// Keyed by domain, not bare JID — the WS endpoint is a property of the *server*,
// so every user connecting to the same domain wants the same override, unlike VFS
// credentials (useVfsConfig.ts), which can legitimately differ per account.
//
// Two independent fields: buildWsUrl's two actual guesses are the scheme (ws vs
// wss, inferred from window.location.protocol) and the port (5280, a fixed
// constant, not inferred). A domain's entry holds whichever of the two has been
// overridden; a field absent from the entry (or the whole entry missing) means
// "keep guessing" for that one.
type ServerConfigEntry = { forceSecure?: boolean; port?: number }
type ServerConfigStore = Record<string, ServerConfigEntry>

function loadStore(): ServerConfigStore {
  try {
    const raw = JSON.parse(localStorage.getItem(SERVER_CONFIG_KEY) ?? '{}')
    if (!raw || typeof raw !== 'object') return {}
    // Pre-port format stored the forceSecure boolean directly as the domain's
    // value, not wrapped in an { forceSecure, port } entry — migrate on read.
    const migrated: ServerConfigStore = {}
    for (const [domain, value] of Object.entries(raw)) {
      migrated[domain] = typeof value === 'boolean' ? { forceSecure: value } : (value as ServerConfigEntry)
    }
    return migrated
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
    return store.value[domain]?.forceSecure
  }

  function setForceSecure(domain: string, forceSecure: boolean): void {
    if (!domain) return
    persist({ ...store.value, [domain]: { ...store.value[domain], forceSecure } })
  }

  function getPort(domain: string): number | undefined {
    return store.value[domain]?.port
  }

  function setPort(domain: string, port: number | undefined): void {
    if (!domain) return
    const entry = { ...store.value[domain] }
    if (port === undefined) delete entry.port
    else entry.port = port
    persist({ ...store.value, [domain]: entry })
  }

  function clearOverride(domain: string): void {
    if (!(domain in store.value)) return
    const next = { ...store.value }
    delete next[domain]
    persist(next)
  }

  return { getForceSecure, setForceSecure, getPort, setPort, clearOverride }
}
