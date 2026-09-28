import { describe, it, expect, beforeEach, vi } from 'vitest'

const platform = { value: 'web' }
const setInstances = vi.fn(async (_: unknown) => {})

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => platform.value },
  registerPlugin: () => ({ setInstances }),
}))

const { normalizeInstanceUrl, weatherInstances, syncWeatherInstances } = await import('../native/weatherWidget')

beforeEach(() => {
  platform.value = 'web'
  setInstances.mockClear()
})

describe('normalizeInstanceUrl', () => {
  it('drops trailing slashes and lowercases the host', () => {
    expect(normalizeInstanceUrl('https://Weather.Example.org/')).toBe('https://weather.example.org')
    expect(normalizeInstanceUrl('https://example.org/weather//')).toBe('https://example.org/weather')
  })

  it('keeps a port', () => {
    expect(normalizeInstanceUrl('http://weather.iagvtsrv:8000/')).toBe('http://weather.iagvtsrv:8000')
  })
})

describe('weatherInstances', () => {
  it('collects weather links across accounts, deduped by URL, first label wins', () => {
    const list = weatherInstances({
      'a@x': [
        { label: 'MONET/S', url: 'https://weather.monet.saao.ac.za', kind: 'weather' },
        { label: 'Portal', url: 'https://observe.x', kind: 'other' },
      ],
      'b@y': [
        { label: 'Other name', url: 'https://weather.monet.saao.ac.za/', kind: 'weather' },
        { label: 'IAG 50cm', url: 'https://weather.iag50srv.astro.physik.uni-goettingen.de', kind: 'weather' },
        { label: 'no kind', url: 'https://weather.z' },
      ],
    })
    expect(list).toEqual([
      { url: 'https://weather.monet.saao.ac.za', label: 'MONET/S' },
      { url: 'https://weather.iag50srv.astro.physik.uni-goettingen.de', label: 'IAG 50cm' },
    ])
  })
})

describe('syncWeatherInstances', () => {
  const store = { 'a@x': [{ label: 'W', url: 'https://weather.x/', kind: 'weather' as const }] }

  it('does nothing off Android', async () => {
    await syncWeatherInstances(store)
    expect(setInstances).not.toHaveBeenCalled()
  })

  it('hands the instance list to the native plugin on Android', async () => {
    platform.value = 'android'
    await syncWeatherInstances(store)
    expect(setInstances).toHaveBeenCalledWith({ instances: [{ url: 'https://weather.x', label: 'W' }] })
  })

  it('swallows plugin failures', async () => {
    platform.value = 'android'
    setInstances.mockRejectedValueOnce(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(syncWeatherInstances(store)).resolves.toBeUndefined()
    warn.mockRestore()
  })
})
