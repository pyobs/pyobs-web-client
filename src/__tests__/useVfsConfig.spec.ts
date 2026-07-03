import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

const jid = ref('')

vi.mock('@/composables/useXmpp', () => ({
  useXmpp: () => ({ jid }),
}))

// Imported after the mock so useVfsConfig picks up the mocked useXmpp.
const { useVfsConfig } = await import('../composables/useVfsConfig')

// useVfsConfig's store is a module-level singleton (same pattern as useXmpp),
// so it isn't reset by clearing localStorage between tests — give every test
// its own bare JID instead, so cases can't leak state into one another.
let userCounter = 0
function freshBareJid(): string {
  return `user${userCounter++}@localhost`
}
function freshJid(): string {
  return `${freshBareJid()}/pyobs`
}

beforeEach(() => {
  localStorage.clear()
  jid.value = ''
})

describe('useVfsConfig', () => {
  it('starts empty with no endpoints configured', () => {
    jid.value = freshJid()
    const { vfsEndpoints } = useVfsConfig()
    expect(vfsEndpoints.value).toEqual([])
  })

  it('adds, updates, and removes endpoints, persisted to localStorage', () => {
    const bare = freshBareJid()
    jid.value = `${bare}/pyobs`
    const { vfsEndpoints, addEndpoint, updateEndpoint, removeEndpoint } = useVfsConfig()

    addEndpoint({ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/' })
    expect(vfsEndpoints.value).toEqual([{ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/' }])
    const persisted = JSON.parse(localStorage.getItem('pyobs_vfs_config')!)
    expect(persisted[bare]).toEqual([{ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/' }])

    updateEndpoint(0, { root: 'pyobs', baseUrl: 'https://new.example.com/pyobs/', username: 'bob' })
    expect(vfsEndpoints.value).toEqual([
      { root: 'pyobs', baseUrl: 'https://new.example.com/pyobs/', username: 'bob' },
    ])

    removeEndpoint(0)
    expect(vfsEndpoints.value).toEqual([])
  })

  it('keeps config isolated per bare JID (per-account, not per-domain)', () => {
    const adminJid = freshJid()
    const guestJid = freshJid()

    jid.value = adminJid
    useVfsConfig().addEndpoint({ root: 'pyobs', baseUrl: 'https://admin.example.com/' })

    jid.value = guestJid
    const guestConfig = useVfsConfig()
    expect(guestConfig.vfsEndpoints.value).toEqual([])
    guestConfig.addEndpoint({ root: 'pyobs', baseUrl: 'https://guest.example.com/' })

    jid.value = adminJid
    expect(useVfsConfig().vfsEndpoints.value).toEqual([{ root: 'pyobs', baseUrl: 'https://admin.example.com/' }])
  })

  it('resolves a VFS path against a matching endpoint', () => {
    jid.value = freshJid()
    const { addEndpoint, resolveVfsPath } = useVfsConfig()
    addEndpoint({ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs' })

    expect(resolveVfsPath('pyobs/2024/07/03/image.fits.gz')).toBe(
      'https://archive.example.com/pyobs/2024/07/03/image.fits.gz',
    )
    // leading slash on the path is stripped before splitting the root, same as
    // pyobs-core's own VirtualFileSystem.split_root
    expect(resolveVfsPath('/pyobs/2024/07/03/image.fits.gz')).toBe(
      'https://archive.example.com/pyobs/2024/07/03/image.fits.gz',
    )
  })

  it('does not double up the slash when baseUrl already ends with one', () => {
    jid.value = freshJid()
    const { addEndpoint, resolveVfsPath } = useVfsConfig()
    addEndpoint({ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/' })

    expect(resolveVfsPath('pyobs/image.fits')).toBe('https://archive.example.com/pyobs/image.fits')
  })

  it('returns null for an unconfigured root or a rootless path', () => {
    jid.value = freshJid()
    const { addEndpoint, resolveVfsPath } = useVfsConfig()
    addEndpoint({ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/' })

    expect(resolveVfsPath('unknown-root/image.fits')).toBeNull()
    expect(resolveVfsPath('no-slash-at-all')).toBeNull()
  })
})
