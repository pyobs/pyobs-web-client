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

  it('adds, updates, and removes endpoints, persisted to localStorage', async () => {
    const bare = freshBareJid()
    jid.value = `${bare}/pyobs`
    const { vfsEndpoints, addEndpoint, updateEndpoint, removeEndpoint } = useVfsConfig()

    await addEndpoint({ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/' })
    expect(vfsEndpoints.value).toEqual([{ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/' }])
    const persisted = JSON.parse(localStorage.getItem('pyobs_vfs_config')!)
    expect(persisted[bare]).toEqual([{ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/' }])

    await updateEndpoint(0, { root: 'pyobs', baseUrl: 'https://new.example.com/pyobs/' })
    expect(vfsEndpoints.value).toEqual([
      { root: 'pyobs', baseUrl: 'https://new.example.com/pyobs/' },
    ])

    await removeEndpoint(0)
    expect(vfsEndpoints.value).toEqual([])
  })

  it('never persists a token to localStorage, and fetches it back via resolveVfsEndpoint', async () => {
    const bare = freshBareJid()
    jid.value = `${bare}/pyobs`
    const { addEndpoint, resolveVfsEndpoint, hasToken } = useVfsConfig()

    await addEndpoint({ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/', token: 'secret' })
    const persisted = JSON.parse(localStorage.getItem('pyobs_vfs_config')!)
    expect(persisted[bare]).toEqual([{ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/' }])

    const resolved = await resolveVfsEndpoint('pyobs/image.fits')
    expect(resolved?.endpoint.token).toBe('secret')
    expect(await hasToken('pyobs')).toBe(true)
  })

  it('renaming a root carries its stored token over, blank token field means "keep unchanged"', async () => {
    const bare = freshBareJid()
    jid.value = `${bare}/pyobs`
    const { addEndpoint, updateEndpoint, resolveVfsEndpoint } = useVfsConfig()

    await addEndpoint({ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/', token: 'secret' })
    await updateEndpoint(0, { root: 'renamed', baseUrl: 'https://archive.example.com/pyobs/' })

    expect(await resolveVfsEndpoint('pyobs/image.fits')).toBeNull()
    const resolved = await resolveVfsEndpoint('renamed/image.fits')
    expect(resolved?.endpoint.token).toBe('secret')
  })

  it('keeps config isolated per bare JID (per-account, not per-domain)', async () => {
    const adminJid = freshJid()
    const guestJid = freshJid()

    jid.value = adminJid
    await useVfsConfig().addEndpoint({ root: 'pyobs', baseUrl: 'https://admin.example.com/' })

    jid.value = guestJid
    const guestConfig = useVfsConfig()
    expect(guestConfig.vfsEndpoints.value).toEqual([])
    await guestConfig.addEndpoint({ root: 'pyobs', baseUrl: 'https://guest.example.com/' })

    jid.value = adminJid
    expect(useVfsConfig().vfsEndpoints.value).toEqual([{ root: 'pyobs', baseUrl: 'https://admin.example.com/' }])
  })

  it('resolves a VFS path against a matching endpoint', async () => {
    jid.value = freshJid()
    const { addEndpoint, resolveVfsPath } = useVfsConfig()
    await addEndpoint({ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs' })

    expect(await resolveVfsPath('pyobs/2024/07/03/image.fits.gz')).toBe(
      'https://archive.example.com/pyobs/2024/07/03/image.fits.gz',
    )
    // leading slash on the path is stripped before splitting the root, same as
    // pyobs-core's own VirtualFileSystem.split_root
    expect(await resolveVfsPath('/pyobs/2024/07/03/image.fits.gz')).toBe(
      'https://archive.example.com/pyobs/2024/07/03/image.fits.gz',
    )
  })

  it('does not double up the slash when baseUrl already ends with one', async () => {
    jid.value = freshJid()
    const { addEndpoint, resolveVfsPath } = useVfsConfig()
    await addEndpoint({ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/' })

    expect(await resolveVfsPath('pyobs/image.fits')).toBe('https://archive.example.com/pyobs/image.fits')
  })

  it('returns null for an unconfigured root or a rootless path', async () => {
    jid.value = freshJid()
    const { addEndpoint, resolveVfsPath } = useVfsConfig()
    await addEndpoint({ root: 'pyobs', baseUrl: 'https://archive.example.com/pyobs/' })

    expect(await resolveVfsPath('unknown-root/image.fits')).toBeNull()
    expect(await resolveVfsPath('no-slash-at-all')).toBeNull()
  })
})
