import { ref, computed } from 'vue'
import { Strophe } from 'strophe.js'
import { useXmpp } from '@/composables/useXmpp'

// A pyobs VFS path is "{root}/{rest...}" — the root name maps, server-side, to a
// backend (LocalFile/SFTPFile/SMBFile/HttpFile/...). A browser can only ever reach
// the HttpFile shape directly, so that's the only backend this config models.
export type VfsEndpoint = {
  root: string
  baseUrl: string
  username?: string
  password?: string
}

const VFS_CONFIG_KEY = 'pyobs_vfs_config'

// Keyed by bare JID — different users of the same deployment may hold different
// credentials for the same archive server, so config is per-account, not per-domain.
type VfsConfigStore = Record<string, VfsEndpoint[]>

function loadStore(): VfsConfigStore {
  try {
    const raw = JSON.parse(localStorage.getItem(VFS_CONFIG_KEY) ?? '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

const store = ref<VfsConfigStore>(loadStore())

function persist(bareJid: string, endpoints: VfsEndpoint[]): void {
  store.value = { ...store.value, [bareJid]: endpoints }
  localStorage.setItem(VFS_CONFIG_KEY, JSON.stringify(store.value))
}

export function useVfsConfig() {
  const { jid } = useXmpp()
  const bareJid = computed(() => (jid.value ? Strophe.getBareJidFromJid(jid.value) : ''))

  const vfsEndpoints = computed<VfsEndpoint[]>(() => store.value[bareJid.value] ?? [])

  function addEndpoint(endpoint: VfsEndpoint): void {
    if (!bareJid.value) return
    persist(bareJid.value, [...vfsEndpoints.value, endpoint])
  }

  function updateEndpoint(index: number, endpoint: VfsEndpoint): void {
    if (!bareJid.value) return
    const next = [...vfsEndpoints.value]
    next[index] = endpoint
    persist(bareJid.value, next)
  }

  function removeEndpoint(index: number): void {
    if (!bareJid.value) return
    persist(bareJid.value, vfsEndpoints.value.filter((_, i) => i !== index))
  }

  // Splits the root off a VFS-style path (mirrors pyobs-core's
  // VirtualFileSystem.split_root), resolves it against a configured endpoint, and
  // returns a real fetchable URL — or null if no endpoint covers that root.
  function resolveVfsPath(path: string): string | null {
    const clean = path.startsWith('/') ? path.slice(1) : path
    const slash = clean.indexOf('/')
    if (slash === -1) return null
    const root = clean.slice(0, slash)
    const rest = clean.slice(slash + 1)
    const endpoint = vfsEndpoints.value.find((e) => e.root === root)
    if (!endpoint) return null
    const base = endpoint.baseUrl.endsWith('/') ? endpoint.baseUrl : `${endpoint.baseUrl}/`
    return base + rest
  }

  return { vfsEndpoints, addEndpoint, updateEndpoint, removeEndpoint, resolveVfsPath }
}
