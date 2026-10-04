// Parser for BaseVideo's /video.raw stream (pyobs-core >= 2.13.0, see
// pyobs-core/specs/design/basevideo-raw-frame-streaming.md and raw_handler in basevideo.py).
//
// What the server actually writes per frame:
//
//   --rawboundary\r\n
//   Content-Type: application/octet-stream\r\n
//   X-Pyobs-Frame-Meta: <one line of JSON>\r\n
//   \r\n
//   <raw little-endian pixel bytes>\r\n
//
// The response declares `boundary=--rawboundary` but writes `--rawboundary` as the delimiter, so a
// standards-following multipart parser would look for `----rawboundary`; this one matches what is
// sent. There is no per-part Content-Length: the byte count comes from the meta (NAXIS, NAXISn,
// DTYPE), which is also why the meta must be parsed before the data can be cut out.
import type { FrameData } from '@/utils/stretch'
import { normalizeDtype } from '@/utils/stretch'

export type FrameMeta = {
  DTYPE: string
  SRCDTYPE?: string
  NAXIS: number
  NAXIS1: number
  NAXIS2: number
  NAXIS3?: number
  VIDFRAME?: number
  SETGEN?: number
  SWBIN?: number
  EXPTIME?: number
  'CROP-X'?: number
  'CROP-Y'?: number
  'DATE-OBS'?: string
  'DATE-SRC'?: string
  'DATE-ARR'?: number
  [key: string]: unknown
}

export type RawFrame = {
  meta: FrameMeta
  width: number
  height: number
  // Colour frames are 3D (NAXIS=3); out of scope for now, callers show a notice instead.
  colour: boolean
  data: FrameData
}

const BOUNDARY = new TextEncoder().encode('--rawboundary\r\n')
const HEADER_END = new TextEncoder().encode('\r\n\r\n')
const META_HEADER = 'x-pyobs-frame-meta'
// A header block is a few hundred bytes to a few kB of FITS keywords; anything far beyond that is
// not this protocol (a login page, an error body) and would otherwise buffer without end.
const MAX_HEADER_BYTES = 1 << 20

const ARRAYS = {
  u1: Uint8Array,
  i1: Int8Array,
  u2: Uint16Array,
  i2: Int16Array,
  u4: Uint32Array,
  i4: Int32Array,
  f4: Float32Array,
  f8: Float64Array,
} as const

export function bytesPerElement(dtype: string): number {
  const size = Number(normalizeDtype(dtype).slice(1))
  if (!(normalizeDtype(dtype) in ARRAYS) || !Number.isInteger(size)) throw new Error(`Unsupported DTYPE "${dtype}"`)
  return size
}

function indexOf(haystack: Uint8Array, needle: Uint8Array, from: number, to: number): number {
  const last = to - needle.length
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

// Python's json.dumps writes NaN/Infinity for non-finite header values, which JSON.parse rejects.
function parseMeta(text: string): FrameMeta {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    try {
      parsed = JSON.parse(text.replace(/(?<![\w\"])-?(?:NaN|Infinity)(?![\w\"])/g, 'null'))
    } catch {
      throw new Error('Frame meta is not valid JSON')
    }
  }
  const m = parsed as Partial<FrameMeta> | null
  if (!m || typeof m.DTYPE !== 'string' || !Number.isInteger(m.NAXIS1) || !Number.isInteger(m.NAXIS2)) {
    throw new Error('Frame meta is missing DTYPE or NAXIS1/NAXIS2')
  }
  return m as FrameMeta
}

function frameBytes(meta: FrameMeta): number {
  const axes = meta.NAXIS ?? 2
  if (axes !== 2 && axes !== 3) throw new Error(`Unsupported NAXIS ${axes}`)
  const planes = axes === 3 ? (meta.NAXIS3 as number) : 1
  if (!Number.isInteger(planes) || planes < 1) throw new Error('Frame meta is missing NAXIS3')
  return meta.NAXIS1 * meta.NAXIS2 * planes * bytesPerElement(meta.DTYPE)
}

export class RawFrameParser {
  private buf = new Uint8Array(1 << 16)
  private len = 0
  private decoder = new TextDecoder()

  // Feeds the next chunk of the response body, returns every frame it completed. Throws on data that
  // can't be this protocol; the parser is unusable afterwards.
  push(chunk: Uint8Array): RawFrame[] {
    this.append(chunk)
    const frames: RawFrame[] = []
    let pos = 0
    for (;;) {
      const next = this.parseOne(pos)
      if (!next) break
      frames.push(next.frame)
      pos = next.end
    }
    // keep only the unconsumed tail
    if (pos > 0) {
      this.buf.copyWithin(0, pos, this.len)
      this.len -= pos
    }
    return frames
  }

  private append(chunk: Uint8Array): void {
    if (this.len + chunk.length > this.buf.length) {
      let size = this.buf.length
      while (size < this.len + chunk.length) size *= 2
      const bigger = new Uint8Array(size)
      bigger.set(this.buf.subarray(0, this.len))
      this.buf = bigger
    }
    this.buf.set(chunk, this.len)
    this.len += chunk.length
  }

  private parseOne(start: number): { frame: RawFrame; end: number } | undefined {
    const b = indexOf(this.buf, BOUNDARY, start, this.len)
    if (b < 0) {
      // No frame start yet. Anything beyond a boundary's length of leftovers is garbage, but only
      // complain once it is clearly not going to turn into one.
      if (this.len - start > MAX_HEADER_BYTES) throw new Error('No frame boundary found in stream')
      return undefined
    }
    const headStart = b + BOUNDARY.length
    const h = indexOf(this.buf, HEADER_END, headStart, this.len)
    if (h < 0) {
      if (this.len - headStart > MAX_HEADER_BYTES) throw new Error('Frame header too large')
      return undefined
    }

    const headers = this.decoder.decode(this.buf.subarray(headStart, h))
    let metaText: string | undefined
    for (const line of headers.split('\r\n')) {
      const colon = line.indexOf(':')
      if (colon > 0 && line.slice(0, colon).trim().toLowerCase() === META_HEADER) metaText = line.slice(colon + 1).trim()
    }
    if (metaText === undefined) throw new Error('Frame is missing the X-Pyobs-Frame-Meta header')
    const meta = parseMeta(metaText)

    const dataStart = h + HEADER_END.length
    const dataEnd = dataStart + frameBytes(meta)
    if (this.len < dataEnd) return undefined

    // Copy into a fresh buffer: the typed array view needs an aligned offset, and the parse buffer
    // is reused for the next frame.
    const bytes = this.buf.slice(dataStart, dataEnd)
    const dtype = normalizeDtype(meta.DTYPE) as keyof typeof ARRAYS
    const data = new ARRAYS[dtype](bytes.buffer) as FrameData
    // The trailing \r\n after the data, if it has arrived already; otherwise the next search skips it.
    const end = this.len >= dataEnd + 2 ? dataEnd + 2 : dataEnd
    return {
      frame: { meta, width: meta.NAXIS1, height: meta.NAXIS2, colour: (meta.NAXIS ?? 2) === 3, data },
      end,
    }
  }
}
