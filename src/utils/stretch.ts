// Client-side counterpart of pyobs-core's pyobs/utils/stretch.py (BaseVideo >= 2.13.0), so the raw
// live view looks like the MJPEG one for the same settings: same cuts modes, same stretch
// functions, same 0.5/99.5 percentile defaults, same subsampling for the cuts.
import type { CutsMode, StretchFunction } from '@/composables/useVideoSettings'
import { DEFAULT_PERCENTILES } from '@/composables/useVideoSettings'

export type FrameData = Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array

export type StretchParams = { stretch: StretchFunction; cuts: CutsMode | ''; lo?: number; hi?: number }

// The cuts are estimated on every 4th pixel in each axis for frames taller than 256 rows, as on the
// server, to keep it cheap.
const CUTS_SUBSAMPLE = 4

// Value range of the integer dtypes, for 'full' cuts. Keyed by numpy's kind+size ("u2", "i4", ...).
const INT_RANGES: Record<string, [number, number]> = {
  u1: [0, 255],
  i1: [-128, 127],
  u2: [0, 65535],
  i2: [-32768, 32767],
  u4: [0, 4294967295],
  i4: [-2147483648, 2147483647],
}

export function isIntegerDtype(dtype: string): boolean {
  return normalizeDtype(dtype) in INT_RANGES
}

// "<u2", "|u1", ">i4" or plain "u2" -> "u2". Byte order is the caller's business.
export function normalizeDtype(dtype: string): string {
  return dtype.replace(/^[<>|=]/, '')
}

// Linear interpolation between closest ranks, like numpy.percentile's default.
function percentile(sorted: ArrayLike<number>, q: number): number {
  const pos = (q / 100) * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

// Resolves the (low, high) cut. `srcDtype` decides 'full' and the default mode and may differ from
// the data's own (a binned frame is float32 but its cuts follow the integer data it came from).
export function computeCuts(
  data: FrameData,
  width: number,
  height: number,
  params: StretchParams,
  srcDtype: string,
): [number, number] {
  const src = normalizeDtype(srcDtype)
  let cuts: CutsMode = params.cuts || (src === 'u1' ? 'full' : 'minmax')
  // 'full' needs integer data; fall back instead of failing a live stream mid-flight.
  if (cuts === 'full' && !(src in INT_RANGES)) cuts = 'minmax'

  if (cuts === 'manual') return [params.lo ?? 0, params.hi ?? 1]
  if (cuts === 'full') return INT_RANGES[src]!

  const step = height > 256 ? CUTS_SUBSAMPLE : 1
  const sample: number[] = []
  for (let y = 0; y < height; y += step) {
    const row = y * width
    for (let x = 0; x < width; x += step) {
      const v = data[row + x]!
      if (Number.isFinite(v)) sample.push(v)
    }
  }
  if (sample.length === 0) return [0, 1]

  if (cuts === 'minmax') {
    let min = Infinity
    let max = -Infinity
    for (const v of sample) {
      if (v < min) min = v
      if (v > max) max = v
    }
    return [min, max]
  }

  const sorted = Float64Array.from(sample).sort()
  const lo = params.lo ?? DEFAULT_PERCENTILES.lo
  const hi = params.hi ?? DEFAULT_PERCENTILES.hi
  return [percentile(sorted, lo), percentile(sorted, hi)]
}

// Maps a normalized 0..1 value through the stretch function, to 0..1.
export function applyStretch(x: number, fn: StretchFunction): number {
  switch (fn) {
    case 'sqrt':
      return Math.sqrt(x)
    case 'asinh':
      return Math.asinh(10 * x) / Math.asinh(10)
    case 'log':
      return Math.log10(1 + 1000 * x) / Math.log10(1001)
    default:
      return x
  }
}

function toGrey(x: number, low: number, span: number, fn: StretchFunction): number {
  const n = Math.min(1, Math.max(0, (x - low) / span))
  return Math.floor(applyStretch(n, fn) * 255 + 0.5)
}

// Writes `data` (width*height values, single channel) as opaque grey RGBA into `out`
// (width*height*4 bytes), and returns the cuts that were used. 8 and 16 bit integer data goes
// through a lookup table, so a 4 Mpx frame costs one table of at most 65536 entries plus a lookup
// per pixel instead of a stretch evaluation per pixel.
export function stretchToRgba(
  data: FrameData,
  width: number,
  height: number,
  params: StretchParams,
  srcDtype: string,
  out: Uint8ClampedArray,
): [number, number] {
  const [low, high] = computeCuts(data, width, height, params, srcDtype)
  const span = high > low ? high - low : 1
  const n = width * height

  let lut: Uint8Array | undefined
  let offset = 0
  if (data instanceof Uint8Array || data instanceof Uint16Array) {
    const size = data instanceof Uint8Array ? 256 : 65536
    lut = new Uint8Array(size)
    for (let i = 0; i < size; i++) lut[i] = toGrey(i, low, span, params.stretch)
  } else if (data instanceof Int8Array || data instanceof Int16Array) {
    const size = data instanceof Int8Array ? 256 : 65536
    offset = size / 2
    lut = new Uint8Array(size)
    for (let i = 0; i < size; i++) lut[i] = toGrey(i - offset, low, span, params.stretch)
  }

  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const g = lut ? lut[data[i]! + offset]! : toGrey(data[i]!, low, span, params.stretch)
    out[j] = g
    out[j + 1] = g
    out[j + 2] = g
    out[j + 3] = 255
  }
  return [low, high]
}
