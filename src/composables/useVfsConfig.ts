import { ref, computed } from 'vue'
import { Strophe } from 'strophe.js'
import { useXmpp } from '@/composables/useXmpp'
import { useCredentialStore } from '@/composables/useCredentialStore'

// A pyobs VFS path is "{root}/{rest...}" — the root name maps, server-side, to a
// backend (LocalFile/SFTPFile/SMBFile/HttpFile/...). A browser can only ever reach
// the HttpFile shape directly, so that's the only backend this config models.
//
// Auth: a single opt-in bearer token, matching pyobs-core's HttpFile — Basic
// Auth (username/password) was removed entirely upstream (commit 9bb4314b,
// released), not deprecated alongside a token option, so this client never
// supported it as a real thing to begin with (Basic Auth was never actually
// enforced server-side; see specs/plans/2026-08-04-vfs-token-auth.md). Nothing
// to migrate from as a result — no legacy-shape handling here.
export type VfsEndpoint = {
  root: string
  baseUrl: string
  token?: string
}

// Only root/baseUrl persist here — the token is a secret and lives in
// useCredentialStore's secure storage instead (see getVfsToken et al. below).
// Kept as a distinct type so a stray `.token` can never leak back into
// localStorage from this side.
type StoredVfsEndpoint = Omit<VfsEndpoint, 'token'>

const VFS_CONFIG_KEY = 'pyobs_vfs_config'

// Keyed by bare JID — different users of the same deployment may hold different
// credentials for the same archive server, so config is per-account, not per-domain.
type VfsConfigStore = Record<string, StoredVfsEndpoint[]>

function loadStore(): VfsConfigStore {
  try {
    const raw = JSON.parse(localStorage.getItem(VFS_CONFIG_KEY) ?? '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

const store = ref<VfsConfigStore>(loadStore())

function persist(bareJid: string, endpoints: StoredVfsEndpoint[]): void {
  store.value = { ...store.value, [bareJid]: endpoints }
  localStorage.setItem(VFS_CONFIG_KEY, JSON.stringify(store.value))
}

function stripToken(endpoint: VfsEndpoint): StoredVfsEndpoint {
  const { token: _token, ...rest } = endpoint
  return rest
}

// overrideBareJid lets a pre-login screen (the "Connections" list) manage a
// saved connection's VFS endpoints before ever connecting as it — without it,
// this always follows the live session's own JID (SettingsView.vue's usage,
// unchanged).
export function useVfsConfig(overrideBareJid?: string) {
  const { jid } = useXmpp()
  const { getVfsToken, setVfsToken, removeVfsToken } = useCredentialStore()
  const bareJid = computed(() => overrideBareJid ?? (jid.value ? (Strophe.getBareJidFromJid(jid.value) ?? '') : ''))

  // Never carries a token — see StoredVfsEndpoint above. Consumers that need
  // the actual secret (resolveVfsEndpoint) fetch it separately, async.
  const vfsEndpoints = computed<VfsEndpoint[]>(() => store.value[bareJid.value] ?? [])

  async function addEndpoint(endpoint: VfsEndpoint): Promise<void> {
    if (!bareJid.value) return
    persist(bareJid.value, [...vfsEndpoints.value, stripToken(endpoint)])
    if (endpoint.token) await setVfsToken(bareJid.value, endpoint.root, endpoint.token)
  }

  async function updateEndpoint(index: number, endpoint: VfsEndpoint): Promise<void> {
    if (!bareJid.value) return
    const oldRoot = vfsEndpoints.value[index]?.root
    const next = [...vfsEndpoints.value]
    next[index] = stripToken(endpoint)
    persist(bareJid.value, next)

    if (endpoint.token) {
      // A new token was entered — store it under the (possibly renamed) root.
      await setVfsToken(bareJid.value, endpoint.root, endpoint.token)
      if (oldRoot && oldRoot !== endpoint.root) await removeVfsToken(bareJid.value, oldRoot)
    } else if (oldRoot && oldRoot !== endpoint.root) {
      // Root renamed, token field left blank ("keep unchanged") — carry
      // whatever was stored under the old root over to the new one, so a
      // rename alone doesn't silently drop a saved token.
      const existing = await getVfsToken(bareJid.value, oldRoot)
      if (existing) {
        await setVfsToken(bareJid.value, endpoint.root, existing)
        await removeVfsToken(bareJid.value, oldRoot)
      }
    }
  }

  async function removeEndpoint(index: number): Promise<void> {
    if (!bareJid.value) return
    const root = vfsEndpoints.value[index]?.root
    persist(bareJid.value, vfsEndpoints.value.filter((_, i) => i !== index))
    if (root) await removeVfsToken(bareJid.value, root)
  }

  // Splits the root off a VFS-style path (mirrors pyobs-core's
  // VirtualFileSystem.split_root) and resolves it against a configured
  // endpoint — the matched endpoint (for its optional bearer token, fetched
  // from secure storage) plus the real fetchable URL, or null if no endpoint
  // covers that root.
  async function resolveVfsEndpoint(path: string): Promise<{ endpoint: VfsEndpoint; url: string } | null> {
    const clean = path.startsWith('/') ? path.slice(1) : path
    const slash = clean.indexOf('/')
    if (slash === -1) return null
    const root = clean.slice(0, slash)
    const rest = clean.slice(slash + 1)
    const stored = vfsEndpoints.value.find((e) => e.root === root)
    if (!stored) return null
    const token = (await getVfsToken(bareJid.value, root)) ?? undefined
    const base = stored.baseUrl.endsWith('/') ? stored.baseUrl : `${stored.baseUrl}/`
    return { endpoint: { ...stored, token }, url: base + rest }
  }

  async function resolveVfsPath(path: string): Promise<string | null> {
    return (await resolveVfsEndpoint(path))?.url ?? null
  }

  // For UI display only — whether a root has a stored token, without ever
  // exposing the token itself (same "just a flag" reasoning as
  // EditConnectionView.vue's hasStoredPassword for the XMPP password).
  async function hasToken(root: string): Promise<boolean> {
    return (await getVfsToken(bareJid.value, root)) !== null
  }

  return { vfsEndpoints, addEndpoint, updateEndpoint, removeEndpoint, resolveVfsPath, resolveVfsEndpoint, hasToken }
}
