import { describe, expect, it } from 'vitest'
import { parseFits } from '../parse'
import { buildFits, card } from './testFits'

describe('parseFits', () => {
  it('parses header and image together', () => {
    const buffer = buildFits(
      { bitpix: 8, width: 2, height: 2, extraCards: [card('OBJECT', 'M31')] },
      new Uint8Array([1, 2, 3, 4]),
    )

    const { header, image } = parseFits(buffer)

    expect(header.get('OBJECT')).toBe('M31')
    expect(image.width).toBe(2)
    expect(image.height).toBe(2)
    expect(Array.from(image.pixels)).toEqual([1, 2, 3, 4])
  })
})
