import { describe, expect, it } from 'vitest'
import { computeMinMax, minMaxStretch, rasterize } from '../render'
import type { FitsImage } from '../types'

describe('computeMinMax', () => {
  it('finds the min and max of a pixel array', () => {
    expect(computeMinMax(new Float64Array([3, -1, 42, 7]))).toEqual({ min: -1, max: 42 })
  })
})

describe('minMaxStretch', () => {
  it('linearly maps [min, max] to [0, 255]', () => {
    const out = minMaxStretch(new Float64Array([0, 50, 100]), { min: 0, max: 100 })
    expect(Array.from(out)).toEqual([0, 128, 255]) // Uint8ClampedArray rounds 127.5 to 128
  })

  it('does not divide by zero for a constant image', () => {
    const out = minMaxStretch(new Float64Array([5, 5, 5]), { min: 5, max: 5 })
    expect(Array.from(out)).toEqual([0, 0, 0])
  })
})

describe('rasterize', () => {
  it('flips rows vertically (FITS row 1 is the bottom of the image)', () => {
    // 2x2 image: on-disk row 0 (bottom) = [0, 0], row 1 (top) = [255, 255].
    const image: FitsImage = {
      width: 2,
      height: 2,
      bitpix: 8,
      bzero: 0,
      bscale: 1,
      pixels: new Float64Array([0, 0, 255, 255]),
    }

    const { data } = rasterize(image, (pixels) => Uint8ClampedArray.from(pixels))

    // Displayed top row shows the on-disk top row (array row 1, all 255s).
    expect(data[0]).toBe(255)
    expect(data[1]).toBe(255)
    expect(data[2]).toBe(255)
    expect(data[3]).toBe(255) // alpha
    // Displayed bottom row shows the on-disk bottom row (array row 0, all 0s).
    const bottomRowStart = (image.height - 1) * image.width * 4
    expect(data[bottomRowStart]).toBe(0)
  })
})
