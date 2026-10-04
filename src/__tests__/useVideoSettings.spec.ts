import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  buildMjpegUrl,
  defaultMjpegSettings,
  defaultRawSettings,
  loadMjpegSettings,
  loadMode,
  loadRawSettings,
  normalizeMjpegSettings,
  normalizeRawSettings,
  saveMjpegSettings,
  saveMode,
  saveRawSettings,
  validateCuts,
  validateMjpegSettings,
} from '../composables/useVideoSettings'

const BASE = 'http://cam.example.com:37077/video.mjpg'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildMjpegUrl', () => {
  it('leaves the URL untouched for default settings', () => {
    expect(buildMjpegUrl(BASE, defaultMjpegSettings())).toBe(BASE)
  })

  it('sends stretch, cuts, scale and quality when set', () => {
    const url = new URL(
      buildMjpegUrl(BASE, { stretch: 'asinh', cuts: 'minmax', scale: 2, quality: 60 }),
    )
    expect(url.searchParams.get('stretch')).toBe('asinh')
    expect(url.searchParams.get('cuts')).toBe('minmax')
    expect(url.searchParams.get('scale')).toBe('2')
    expect(url.searchParams.get('quality')).toBe('60')
    expect(url.searchParams.has('lo')).toBe(false)
  })

  it('sends lo/hi only for percentile and manual cuts', () => {
    const base = { ...defaultMjpegSettings(), lo: 1, hi: 99 }
    expect(new URL(buildMjpegUrl(BASE, { ...base, cuts: 'minmax' })).searchParams.has('lo')).toBe(false)
    expect(new URL(buildMjpegUrl(BASE, { ...base, cuts: '' })).searchParams.has('lo')).toBe(false)
    const p = new URL(buildMjpegUrl(BASE, { ...base, cuts: 'percentile' })).searchParams
    expect([p.get('lo'), p.get('hi')]).toEqual(['1', '99'])
    const m = new URL(buildMjpegUrl(BASE, { ...base, cuts: 'manual', lo: 100, hi: 4000 })).searchParams
    expect([m.get('lo'), m.get('hi')]).toEqual(['100', '4000'])
  })

  it('keeps existing query parameters of the base URL', () => {
    const url = new URL(buildMjpegUrl(`${BASE}?foo=bar`, { ...defaultMjpegSettings(), stretch: 'log' }))
    expect(url.searchParams.get('foo')).toBe('bar')
    expect(url.searchParams.get('stretch')).toBe('log')
  })
})

describe('validateMjpegSettings', () => {
  it('accepts defaults', () => {
    expect(validateMjpegSettings(defaultMjpegSettings())).toBeUndefined()
  })

  it('rejects out-of-range quality and scale, including a cleared input', () => {
    const d = defaultMjpegSettings()
    expect(validateMjpegSettings({ ...d, quality: 0 })).toBeDefined()
    expect(validateMjpegSettings({ ...d, quality: 96 })).toBeDefined()
    expect(validateMjpegSettings({ ...d, quality: '' as unknown as number })).toBeDefined()
    expect(validateMjpegSettings({ ...d, quality: 95 })).toBeUndefined()
    expect(validateMjpegSettings({ ...d, scale: 0 })).toBeDefined()
  })

  it('requires both lo and hi, ordered, for manual cuts', () => {
    const s = { ...defaultMjpegSettings(), cuts: 'manual' as const }
    expect(validateMjpegSettings(s)).toBeDefined()
    expect(validateMjpegSettings({ ...s, lo: 10 })).toBeDefined()
    expect(validateMjpegSettings({ ...s, lo: 10, hi: 10 })).toBeDefined()
    expect(validateMjpegSettings({ ...s, lo: 10, hi: 20 })).toBeUndefined()
  })

  it('checks percentile range, using 0.5/99.5 for missing values', () => {
    const s = { ...defaultMjpegSettings(), cuts: 'percentile' as const }
    expect(validateMjpegSettings(s)).toBeUndefined()
    expect(validateMjpegSettings({ ...s, lo: 99.4 })).toBeUndefined()
    expect(validateMjpegSettings({ ...s, lo: 99.5 })).toBeDefined()
    expect(validateMjpegSettings({ ...s, lo: -1, hi: 50 })).toBeDefined()
    expect(validateMjpegSettings({ ...s, lo: 10, hi: 101 })).toBeDefined()
  })
})

describe('normalizeMjpegSettings', () => {
  it('falls back to defaults for junk', () => {
    expect(normalizeMjpegSettings(undefined)).toEqual(defaultMjpegSettings())
    expect(normalizeMjpegSettings('x')).toEqual(defaultMjpegSettings())
    expect(
      normalizeMjpegSettings({ stretch: 'cubic', cuts: 7, lo: 'a', hi: NaN, scale: 0, quality: 200 }),
    ).toEqual(defaultMjpegSettings())
  })

  it('keeps valid values', () => {
    const s = { stretch: 'sqrt', cuts: 'percentile', lo: 1, hi: 99, scale: 4, quality: 90 }
    expect(normalizeMjpegSettings(s)).toEqual(s)
  })
})

describe('storage', () => {
  it('returns defaults for an unknown camera', () => {
    expect(loadMjpegSettings('cam@x/y')).toEqual(defaultMjpegSettings())
  })

  it('round-trips per camera', () => {
    const a = { ...defaultMjpegSettings(), stretch: 'log' as const }
    const b = { ...defaultMjpegSettings(), scale: 2 }
    saveMjpegSettings('a@x', a)
    saveMjpegSettings('b@x', b)
    expect(loadMjpegSettings('a@x')).toEqual(a)
    expect(loadMjpegSettings('b@x')).toEqual(b)
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('pyobs_video_settings', '{not json')
    expect(loadMjpegSettings('a@x')).toEqual(defaultMjpegSettings())
    localStorage.setItem('pyobs_video_settings', '[1,2]')
    expect(loadMjpegSettings('a@x')).toEqual(defaultMjpegSettings())
  })

  it('does not throw when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadMjpegSettings('a@x')).toEqual(defaultMjpegSettings())
    expect(() => saveMjpegSettings('a@x', defaultMjpegSettings())).not.toThrow()
  })
})

describe('mode and raw settings', () => {
  it('defaults to MJPEG and remembers the mode per camera', () => {
    expect(loadMode('a@x')).toBe('mjpeg')
    saveMode('a@x', 'raw')
    expect(loadMode('a@x')).toBe('raw')
    expect(loadMode('b@x')).toBe('mjpeg')
  })

  it('falls back to MJPEG for an unknown stored mode', () => {
    localStorage.setItem('pyobs_video_settings', JSON.stringify({ 'a@x': { mode: 'webgl' } }))
    expect(loadMode('a@x')).toBe('mjpeg')
  })

  it('stores mode, mjpeg and raw settings side by side without overwriting each other', () => {
    const raw = { stretch: 'sqrt' as const, cuts: 'manual' as const, lo: 1, hi: 9 }
    saveRawSettings('a@x', raw)
    saveMode('a@x', 'raw')
    saveMjpegSettings('a@x', { ...defaultMjpegSettings(), scale: 4 })
    expect(loadRawSettings('a@x')).toEqual(raw)
    expect(loadMode('a@x')).toBe('raw')
    expect(loadMjpegSettings('a@x').scale).toBe(4)
  })

  it('normalizes junk raw settings to defaults', () => {
    expect(normalizeRawSettings({ stretch: 'cubic', cuts: 1, lo: 'x' })).toEqual(defaultRawSettings())
    expect(normalizeRawSettings(null)).toEqual(defaultRawSettings())
  })

  it('validates raw cuts the same way', () => {
    expect(validateCuts({ cuts: 'manual', lo: 1 })).toBeDefined()
    expect(validateCuts({ cuts: 'manual', lo: 1, hi: 2 })).toBeUndefined()
    expect(validateCuts({ cuts: '' })).toBeUndefined()
  })
})
