import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

const jid = ref('')

vi.mock('@/composables/useXmpp', () => ({
  useXmpp: () => ({ jid }),
}))

const KEY = 'pyobs_linked_apps'

// The store is read once at module load (module-level singleton), so the load-time migration can
// only be exercised by seeding localStorage first and importing a fresh copy of the module.
async function importFresh() {
  vi.resetModules()
  return await import('../composables/useLinkedApps')
}

beforeEach(() => {
  localStorage.clear()
  jid.value = ''
})

describe('guessKind', () => {
  it('treats weather.<domain> hosts as weather instances', async () => {
    const { guessKind } = await importFresh()
    expect(guessKind('https://weather.monet.saao.ac.za')).toBe('weather')
    expect(guessKind('https://weather.iag50srv.astro.physik.uni-goettingen.de/')).toBe('weather')
  })

  it('treats everything else, including unparseable URLs, as other', async () => {
    const { guessKind } = await importFresh()
    expect(guessKind('https://observe.example.com')).toBe('other')
    expect(guessKind('https://example.com/weather')).toBe('other')
    expect(guessKind('not a url')).toBe('other')
  })
})

describe('migrateLinkedApps', () => {
  it('backfills a missing kind and keeps an explicit one', async () => {
    const { migrateLinkedApps } = await importFresh()
    const { store, changed } = migrateLinkedApps({
      'a@x': [
        { label: 'Weather', url: 'https://weather.x' },
        { label: 'Portal', url: 'https://observe.x' },
        { label: 'Not weather', url: 'https://weather.y', kind: 'other' },
      ],
    })
    expect(changed).toBe(true)
    expect(store['a@x']!.map((a) => a.kind)).toEqual(['weather', 'other', 'other'])
  })

  it('reports no change once every entry has a kind', async () => {
    const { migrateLinkedApps } = await importFresh()
    const { changed } = migrateLinkedApps({ 'a@x': [{ label: 'W', url: 'https://weather.x', kind: 'weather' }] })
    expect(changed).toBe(false)
  })
})

describe('useLinkedApps', () => {
  it('migrates entries stored before kind existed and writes them back', async () => {
    localStorage.setItem(KEY, JSON.stringify({ 'old@x': [{ label: 'Weather', url: 'https://weather.x' }] }))
    const { useLinkedApps } = await importFresh()
    expect(JSON.parse(localStorage.getItem(KEY)!)['old@x'][0].kind).toBe('weather')

    jid.value = 'old@x/pyobs'
    const { linkedApps } = useLinkedApps()
    expect(linkedApps.value[0]!.kind).toBe('weather')
  })

  it('seeds a new account with the weather link marked as weather', async () => {
    const { useLinkedApps } = await importFresh()
    jid.value = 'new@example.org/pyobs'
    const { linkedApps } = useLinkedApps()
    expect(linkedApps.value.map((a) => [a.label, a.kind])).toEqual([
      ['Weather', 'weather'],
      ['Portal', 'other'],
      ['Web Admin', 'other'],
    ])
  })

  it('persists kind on added and updated links', async () => {
    localStorage.setItem(KEY, JSON.stringify({ 'u@x': [] }))
    const { useLinkedApps } = await importFresh()
    jid.value = 'u@x/pyobs'
    const { linkedApps, addLink, updateLink } = useLinkedApps()

    addLink({ label: 'IAG', url: 'https://wx.example.org', kind: 'weather' })
    expect(JSON.parse(localStorage.getItem(KEY)!)['u@x'][0].kind).toBe('weather')

    updateLink(0, { ...linkedApps.value[0]!, kind: 'other' })
    expect(JSON.parse(localStorage.getItem(KEY)!)['u@x'][0].kind).toBe('other')
  })
})
