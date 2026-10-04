import { describe, it, expect } from 'vitest'
import { RawFrameParser, bytesPerElement } from '../utils/rawFrameParser'

const enc = new TextEncoder()

function part(meta: Record<string, unknown> | string, data: Uint8Array): Uint8Array {
  const json = typeof meta === 'string' ? meta : JSON.stringify(meta)
  const head = enc.encode(
    `--rawboundary\r\nContent-Type: application/octet-stream\r\nX-Pyobs-Frame-Meta: ${json}\r\n\r\n`,
  )
  const tail = enc.encode('\r\n')
  const out = new Uint8Array(head.length + data.length + tail.length)
  out.set(head, 0)
  out.set(data, head.length)
  out.set(tail, head.length + data.length)
  return out
}

function u16(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2)
  const view = new DataView(out.buffer)
  values.forEach((v, i) => view.setUint16(i * 2, v, true))
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const META = { DTYPE: '<u2', SRCDTYPE: '<u2', NAXIS: 2, NAXIS1: 3, NAXIS2: 2, VIDFRAME: 7 }

describe('RawFrameParser', () => {
  it('parses one complete frame', () => {
    const frames = new RawFrameParser().push(part(META, u16([1, 2, 3, 40000, 5, 65535])))
    expect(frames).toHaveLength(1)
    expect(frames[0]!.width).toBe(3)
    expect(frames[0]!.height).toBe(2)
    expect(frames[0]!.meta.VIDFRAME).toBe(7)
    expect(frames[0]!.colour).toBe(false)
    expect(frames[0]!.data).toBeInstanceOf(Uint16Array)
    expect(Array.from(frames[0]!.data)).toEqual([1, 2, 3, 40000, 5, 65535])
  })

  it('decodes little-endian data', () => {
    const frames = new RawFrameParser().push(part({ ...META, NAXIS1: 1, NAXIS2: 1 }, new Uint8Array([0x34, 0x12])))
    expect(frames[0]!.data[0]).toBe(0x1234)
  })

  it('returns several frames from one chunk', () => {
    const stream = concat(
      part({ ...META, VIDFRAME: 1 }, u16([1, 1, 1, 1, 1, 1])),
      part({ ...META, VIDFRAME: 2 }, u16([2, 2, 2, 2, 2, 2])),
    )
    const frames = new RawFrameParser().push(stream)
    expect(frames.map((f) => f.meta.VIDFRAME)).toEqual([1, 2])
  })

  it('handles any split of the stream, byte by byte', () => {
    const stream = concat(
      part({ ...META, VIDFRAME: 1 }, u16([1, 2, 3, 4, 5, 6])),
      part({ ...META, VIDFRAME: 2 }, u16([7, 8, 9, 10, 11, 12])),
    )
    const parser = new RawFrameParser()
    const frames = []
    for (const byte of stream) frames.push(...parser.push(new Uint8Array([byte])))
    expect(frames.map((f) => f.meta.VIDFRAME)).toEqual([1, 2])
    expect(Array.from(frames[1]!.data)).toEqual([7, 8, 9, 10, 11, 12])
  })

  it('does not mistake boundary-like bytes inside the data for a frame start', () => {
    const fake = enc.encode('--rawboundary\r\n')
    const data = new Uint8Array(fake.length + (fake.length % 2))
    data.set(fake)
    const meta = { DTYPE: '<u1', NAXIS: 2, NAXIS1: data.length, NAXIS2: 1 }
    const frames = new RawFrameParser().push(part(meta, data))
    expect(frames).toHaveLength(1)
    expect(frames[0]!.data.length).toBe(data.length)
  })

  it('waits for a frame whose data has not fully arrived', () => {
    const whole = part(META, u16([1, 2, 3, 4, 5, 6]))
    const parser = new RawFrameParser()
    expect(parser.push(whole.subarray(0, whole.length - 5))).toHaveLength(0)
    expect(parser.push(whole.subarray(whole.length - 5))).toHaveLength(1)
  })

  it('tolerates NaN and Infinity in the meta, as Python writes them', () => {
    const json = '{"DTYPE":"<u2","NAXIS":2,"NAXIS1":1,"NAXIS2":1,"CDELT1":NaN,"X":-Infinity}'
    const frames = new RawFrameParser().push(part(json, u16([9])))
    expect(frames[0]!.meta.CDELT1).toBeNull()
    expect(frames[0]!.data[0]).toBe(9)
  })

  it('reads float32 binned frames', () => {
    const data = new Uint8Array(new Float32Array([0.5, 1.5]).buffer)
    const frames = new RawFrameParser().push(
      part({ DTYPE: '<f4', SRCDTYPE: '<u2', NAXIS: 2, NAXIS1: 2, NAXIS2: 1, SWBIN: 2 }, data),
    )
    expect(frames[0]!.data).toBeInstanceOf(Float32Array)
    expect(Array.from(frames[0]!.data)).toEqual([0.5, 1.5])
  })

  it('flags 3D (colour) frames and sizes them with NAXIS3', () => {
    const meta = { DTYPE: '<u1', NAXIS: 3, NAXIS1: 2, NAXIS2: 1, NAXIS3: 3 }
    const frames = new RawFrameParser().push(part(meta, new Uint8Array([1, 2, 3, 4, 5, 6])))
    expect(frames[0]!.colour).toBe(true)
    expect(frames[0]!.data.length).toBe(6)
  })

  it('skips leading junk before the first boundary', () => {
    const frames = new RawFrameParser().push(concat(enc.encode('\r\nxx'), part(META, u16([1, 2, 3, 4, 5, 6]))))
    expect(frames).toHaveLength(1)
  })

  it('throws on a missing meta header, bad meta and unsupported dtype', () => {
    const noMeta = enc.encode('--rawboundary\r\nContent-Type: x\r\n\r\nabc')
    expect(() => new RawFrameParser().push(noMeta)).toThrow(/X-Pyobs-Frame-Meta/)
    expect(() => new RawFrameParser().push(part('not json', new Uint8Array(2)))).toThrow(/JSON/)
    expect(() => new RawFrameParser().push(part({ ...META, DTYPE: '<c8' }, new Uint8Array(2)))).toThrow(/DTYPE/)
    expect(() => new RawFrameParser().push(part({ ...META, NAXIS: 1 }, new Uint8Array(2)))).toThrow(/NAXIS/)
  })
})

describe('bytesPerElement', () => {
  it('knows the supported dtypes', () => {
    expect(bytesPerElement('<u2')).toBe(2)
    expect(bytesPerElement('|u1')).toBe(1)
    expect(bytesPerElement('<f4')).toBe(4)
    expect(bytesPerElement('<f8')).toBe(8)
    expect(() => bytesPerElement('<U3')).toThrow()
  })
})
