import { describe, expect, it } from 'vitest'
import { parseHeader } from '../header'
import { buildHeaderBytes, card, toArrayBuffer } from './testFits'

describe('parseHeader', () => {
  it('parses typed card values', () => {
    const bytes = buildHeaderBytes([
      card('SIMPLE', true),
      card('BITPIX', 8),
      card('NAXIS', 2),
      card('NAXIS1', 3),
      card('NAXIS2', 2, 'a comment'),
      card('OBJECT', 'M31'),
      card('EXPTIME', 1.5),
    ])
    const buffer = toArrayBuffer(bytes)

    const { header, dataOffset } = parseHeader(buffer, 0)

    expect(header.get('SIMPLE')).toBe(true)
    expect(header.get('BITPIX')).toBe(8)
    expect(header.get('NAXIS1')).toBe(3)
    expect(header.get('NAXIS2')).toBe(2)
    expect(header.get('OBJECT')).toBe('M31')
    expect(header.get('EXPTIME')).toBe(1.5)
    expect(header.contains('OBJECT')).toBe(true)
    expect(header.contains('MISSING')).toBe(false)
    expect(dataOffset).toBe(2880)
  })

  it('handles an embedded quote in a string value', () => {
    const bytes = buildHeaderBytes([card('OBSERVER', "O'Brien")])
    const buffer = toArrayBuffer(bytes)

    const { header } = parseHeader(buffer, 0)

    expect(header.get('OBSERVER')).toBe("O'Brien")
  })

  it('pads the header to the next 2880-byte block', () => {
    // Many cards, enough to spill into a second 2880-byte block.
    const cards = Array.from({ length: 40 }, (_, i) => card(`KEY${i}`, i))
    const bytes = buildHeaderBytes(cards)
    const buffer = toArrayBuffer(bytes)

    const { dataOffset } = parseHeader(buffer, 0)

    expect(dataOffset).toBe(5760) // 2 blocks
  })

  it('throws if no END card is found before the buffer ends', () => {
    const bytes = buildHeaderBytes([card('SIMPLE', true)]).slice(0, 80)
    const buffer = toArrayBuffer(bytes)

    expect(() => parseHeader(buffer, 0)).toThrow()
  })
})
