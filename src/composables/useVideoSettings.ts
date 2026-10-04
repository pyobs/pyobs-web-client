// Per-camera live-view settings (issue #58, specs/plans/2026-10-04-video-live-view-modes.md).
// Stored in localStorage keyed by module JID, same convenience-only treatment as the other
// per-viewer stores here: every read/write is wrapped, and the view works with storage broken.

export const STRETCH_FUNCTIONS = ['linear', 'sqrt', 'asinh', 'log'] as const
export const CUTS_MODES = ['full', 'minmax', 'percentile', 'manual'] as const

export type StretchFunction = (typeof STRETCH_FUNCTIONS)[number]
export type CutsMode = (typeof CUTS_MODES)[number]

// Server-side stretch for /video.mjpg (pyobs-core BaseVideo, >= 2.13.0). '' means "don't send it,
// use the module's own default" — those defaults are module options, unknown to the client.
export type MjpegSettings = {
  stretch: StretchFunction | ''
  cuts: CutsMode | ''
  lo?: number
  hi?: number
  scale: number
  quality: number
}

// Client-side stretch for the raw stream: applied in the browser on every frame, so changes need no
// reconnect. cuts '' means the default for the data (full range for 8-bit, minmax otherwise), the
// same rule BaseVideo uses; stretch has no "module default" since there is no module involved.
export type RawSettings = {
  stretch: StretchFunction
  cuts: CutsMode | ''
  lo?: number
  hi?: number
}

export type LiveViewMode = 'mjpeg' | 'raw'

export const DEFAULT_SCALE = 1
export const DEFAULT_QUALITY = 80
export const MIN_QUALITY = 1
export const MAX_QUALITY = 95
export const DEFAULT_PERCENTILES = { lo: 0.5, hi: 99.5 }

export function defaultMjpegSettings(): MjpegSettings {
  return { stretch: '', cuts: '', scale: DEFAULT_SCALE, quality: DEFAULT_QUALITY }
}

export function defaultRawSettings(): RawSettings {
  return { stretch: 'linear', cuts: '' }
}

const STORAGE_KEY = 'pyobs_video_settings'

type Store = Record<string, { mode?: unknown; mjpeg?: unknown; raw?: unknown }>

function finite(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

// Anything unrecognised falls back to its default, so a corrupt or hand-edited entry can't break
// the view or produce a request the server answers with a 400.
export function normalizeMjpegSettings(raw: unknown): MjpegSettings {
  const out = defaultMjpegSettings()
  if (typeof raw !== 'object' || raw === null) return out
  const r = raw as Record<string, unknown>
  if ((STRETCH_FUNCTIONS as readonly unknown[]).includes(r.stretch)) out.stretch = r.stretch as StretchFunction
  if ((CUTS_MODES as readonly unknown[]).includes(r.cuts)) out.cuts = r.cuts as CutsMode
  out.lo = finite(r.lo)
  out.hi = finite(r.hi)
  const scale = finite(r.scale)
  if (scale !== undefined && Number.isInteger(scale) && scale >= 1) out.scale = scale
  const quality = finite(r.quality)
  if (quality !== undefined && Number.isInteger(quality) && quality >= MIN_QUALITY && quality <= MAX_QUALITY) {
    out.quality = quality
  }
  return out
}

export function normalizeRawSettings(raw: unknown): RawSettings {
  const out = defaultRawSettings()
  if (typeof raw !== 'object' || raw === null) return out
  const r = raw as Record<string, unknown>
  if ((STRETCH_FUNCTIONS as readonly unknown[]).includes(r.stretch)) out.stretch = r.stretch as StretchFunction
  if ((CUTS_MODES as readonly unknown[]).includes(r.cuts)) out.cuts = r.cuts as CutsMode
  out.lo = finite(r.lo)
  out.hi = finite(r.hi)
  return out
}

function loadStore(): Store {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

export function loadMjpegSettings(jid: string): MjpegSettings {
  return normalizeMjpegSettings(loadStore()[jid]?.mjpeg)
}

// Writes one field of a camera's entry, leaving the others alone.
function saveField(jid: string, field: 'mode' | 'mjpeg' | 'raw', value: unknown): void {
  try {
    const store = loadStore()
    store[jid] = { ...store[jid], [field]: value }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // storage unavailable or full: settings just won't be remembered
  }
}

export function saveMjpegSettings(jid: string, settings: MjpegSettings): void {
  saveField(jid, 'mjpeg', settings)
}

export function loadRawSettings(jid: string): RawSettings {
  return normalizeRawSettings(loadStore()[jid]?.raw)
}

export function saveRawSettings(jid: string, settings: RawSettings): void {
  saveField(jid, 'raw', settings)
}

// MJPEG is the default: it works everywhere, including phones and slow uplinks.
export function loadMode(jid: string): LiveViewMode {
  return loadStore()[jid]?.mode === 'raw' ? 'raw' : 'mjpeg'
}

export function saveMode(jid: string, mode: LiveViewMode): void {
  saveField(jid, 'mode', mode)
}

// Whether the settings describe a request the server accepts. Manual cuts need both lo and hi
// (the server answers 400 otherwise), quality is 1..95, percentiles need 0 <= lo < hi <= 100 (defaults 0.5/99.5).
export function validateMjpegSettings(s: MjpegSettings): string | undefined {
  return validateQuality(s) ?? validateCuts(s)
}


function validateQuality(s: MjpegSettings): string | undefined {
  if (!Number.isInteger(s.quality) || s.quality < MIN_QUALITY || s.quality > MAX_QUALITY) {
    return `Quality must be a whole number from ${MIN_QUALITY} to ${MAX_QUALITY}.`
  }
  if (!Number.isInteger(s.scale) || s.scale < 1) return 'Downsample must be a whole number, at least 1.'
  return undefined
}

export function validateCuts(s: { cuts: CutsMode | ''; lo?: number; hi?: number }): string | undefined {
  if (s.cuts === 'manual') {
    if (s.lo === undefined || s.hi === undefined) return 'Manual cuts need both low and high.'
    if (s.lo >= s.hi) return 'Low must be smaller than high.'
  }
  if (s.cuts === 'percentile') {
    const lo = s.lo ?? DEFAULT_PERCENTILES.lo
    const hi = s.hi ?? DEFAULT_PERCENTILES.hi
    if (!(lo >= 0 && lo < hi && hi <= 100)) return 'Percentiles need 0 <= low < high <= 100.'
  }
  return undefined
}

// Only settings that differ from "server default" are sent, so with untouched settings the URL is
// the bare stream URL, identical to what servers without the stretch parameters expect.
export function buildMjpegUrl(baseUrl: string, s: MjpegSettings): string {
  const url = new URL(baseUrl)
  if (s.stretch) url.searchParams.set('stretch', s.stretch)
  if (s.cuts) url.searchParams.set('cuts', s.cuts)
  if (s.cuts === 'percentile' || s.cuts === 'manual') {
    if (s.lo !== undefined) url.searchParams.set('lo', String(s.lo))
    if (s.hi !== undefined) url.searchParams.set('hi', String(s.hi))
  }
  if (s.scale !== DEFAULT_SCALE) url.searchParams.set('scale', String(s.scale))
  if (s.quality !== DEFAULT_QUALITY) url.searchParams.set('quality', String(s.quality))
  return url.toString()
}
