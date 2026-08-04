import { describe, expect, it } from 'vitest'
import { decodeImage } from '../image'
import { parseHeader } from '../header'
import { FitsHeader } from '../types'
import { buildFits } from './testFits'

describe('decodeImage', () => {
  it('decodes an 8-bit image (unsigned, no scaling)', () => {
    const width = 3
    const height = 2
    const pixelBytes = new Uint8Array([10, 20, 30, 40, 50, 60])
    const buffer = buildFits({ bitpix: 8, width, height }, pixelBytes)

    const { header, dataOffset } = parseHeader(buffer, 0)
    const image = decodeImage(buffer, dataOffset, header)

    expect(image.width).toBe(3)
    expect(image.height).toBe(2)
    expect(Array.from(image.pixels)).toEqual([10, 20, 30, 40, 50, 60])
  })

  it('applies BZERO/BSCALE (the "unsigned 16-bit" convention)', () => {
    const width = 2
    const height = 1
    const raw = new Int16Array([-32768, 0]) // physical: 0, 32768
    const bytes = new Uint8Array(raw.buffer.slice(0))
    // Int16Array above is little/native-endian; FITS wants big-endian, so
    // swap the two bytes of each 16-bit value.
    const beBytes = new Uint8Array(bytes.length)
    for (let i = 0; i < raw.length; i++) {
      beBytes[i * 2] = bytes[i * 2 + 1]!
      beBytes[i * 2 + 1] = bytes[i * 2]!
    }
    const buffer = buildFits({ bitpix: 16, width, height, bzero: 32768, bscale: 1 }, beBytes)

    const { header, dataOffset } = parseHeader(buffer, 0)
    const image = decodeImage(buffer, dataOffset, header)

    expect(Array.from(image.pixels)).toEqual([0, 32768])
  })

  it('throws on missing NAXIS1/NAXIS2', () => {
    const buffer = buildFits({ bitpix: 8, width: 1, height: 1 }, new Uint8Array([1]))
    const { dataOffset } = parseHeader(buffer, 0)
    expect(() => decodeImage(buffer, dataOffset, new FitsHeader([]))).toThrow()
  })
})
