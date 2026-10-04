import { describe, it, expect } from 'vitest'
import { applyStretch, computeCuts, stretchToRgba, type StretchParams } from '../utils/stretch'

const P = (p: Partial<StretchParams> = {}): StretchParams => ({ stretch: 'linear', cuts: '', ...p })

describe('applyStretch', () => {
  it('maps 0 to 0 and 1 to 1 for every function', () => {
    for (const fn of ['linear', 'sqrt', 'asinh', 'log'] as const) {
      expect(applyStretch(0, fn)).toBeCloseTo(0, 12)
      expect(applyStretch(1, fn)).toBeCloseTo(1, 12)
    }
  })

  it('matches the server formulas at 0.25', () => {
    expect(applyStretch(0.25, 'linear')).toBe(0.25)
    expect(applyStretch(0.25, 'sqrt')).toBeCloseTo(0.5, 12)
    expect(applyStretch(0.25, 'asinh')).toBeCloseTo(Math.asinh(2.5) / Math.asinh(10), 12)
    expect(applyStretch(0.25, 'log')).toBeCloseTo(Math.log10(251) / Math.log10(1001), 12)
  })
})

describe('computeCuts', () => {
  const data = Uint16Array.from([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000])

  it('defaults to minmax for 16 bit and full range for 8 bit', () => {
    expect(computeCuts(data, 10, 1, P(), '<u2')).toEqual([100, 1000])
    expect(computeCuts(Uint8Array.from([5, 9]), 2, 1, P(), '|u1')).toEqual([0, 255])
  })

  it("'full' uses the source dtype's range, also for binned float data", () => {
    expect(computeCuts(data, 10, 1, P({ cuts: 'full' }), '<u2')).toEqual([0, 65535])
    expect(computeCuts(Float32Array.from([1, 2]), 2, 1, P({ cuts: 'full' }), '<u2')).toEqual([0, 65535])
    expect(computeCuts(Int16Array.from([1, 2]), 2, 1, P({ cuts: 'full' }), '<i2')).toEqual([-32768, 32767])
  })

  it("falls back to minmax for 'full' on float source data", () => {
    expect(computeCuts(Float32Array.from([1, 4]), 2, 1, P({ cuts: 'full' }), '<f4')).toEqual([1, 4])
  })

  it('returns manual cuts as given', () => {
    expect(computeCuts(data, 10, 1, P({ cuts: 'manual', lo: 150, hi: 250 }), '<u2')).toEqual([150, 250])
  })

  it('interpolates percentiles like numpy', () => {
    // numpy.percentile([100..1000], [10, 90]) -> [190, 910]
    const [lo, hi] = computeCuts(data, 10, 1, P({ cuts: 'percentile', lo: 10, hi: 90 }), '<u2')
    expect(lo).toBeCloseTo(190, 9)
    expect(hi).toBeCloseTo(910, 9)
  })

  it('uses 0.5 / 99.5 when percentiles are not given', () => {
    const [lo, hi] = computeCuts(data, 10, 1, P({ cuts: 'percentile' }), '<u2')
    expect(lo).toBeCloseTo(100 + 0.005 * 9 * 100, 9)
    expect(hi).toBeCloseTo(100 + 0.995 * 9 * 100, 9)
  })

  it('ignores non-finite values and survives an all-NaN frame', () => {
    expect(computeCuts(Float32Array.from([NaN, 2, 8, Infinity]), 4, 1, P(), '<f4')).toEqual([2, 8])
    expect(computeCuts(Float32Array.from([NaN, NaN]), 2, 1, P(), '<f4')).toEqual([0, 1])
  })

  it('subsamples every 4th pixel of tall frames, like the server', () => {
    const w = 8
    const h = 300
    const big = new Uint16Array(w * h).fill(10)
    big[1] = 9999 // row 0, column 1: skipped by the subsample
    big[4] = 5 // row 0, column 4: sampled
    expect(computeCuts(big, w, h, P(), '<u2')).toEqual([5, 10])
  })
})

describe('stretchToRgba', () => {
  it('stretches 16 bit data linearly between the cuts, opaque grey', () => {
    const out = new Uint8ClampedArray(4 * 4)
    const cuts = stretchToRgba(Uint16Array.from([100, 200, 300, 500]), 4, 1, P(), '<u2', out)
    expect(cuts).toEqual([100, 500])
    expect(Array.from(out)).toEqual([0, 0, 0, 255, 64, 64, 64, 255, 128, 128, 128, 255, 255, 255, 255, 255])
  })

  it('clips values outside manual cuts', () => {
    const out = new Uint8ClampedArray(3 * 4)
    stretchToRgba(Uint16Array.from([0, 150, 1000]), 3, 1, P({ cuts: 'manual', lo: 100, hi: 200 }), '<u2', out)
    expect([out[0], out[4], out[8]]).toEqual([0, 128, 255])
  })

  it('gives the same result for a lookup table and direct evaluation', () => {
    const u16 = Uint16Array.from([10, 500, 1234, 4000, 65535])
    const f32 = Float32Array.from(u16)
    const params = P({ stretch: 'asinh', cuts: 'manual', lo: 10, hi: 4000 })
    const a = new Uint8ClampedArray(5 * 4)
    const b = new Uint8ClampedArray(5 * 4)
    stretchToRgba(u16, 5, 1, params, '<u2', a)
    stretchToRgba(f32, 5, 1, params, '<u2', b)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('handles signed data through the lookup table', () => {
    const out = new Uint8ClampedArray(3 * 4)
    stretchToRgba(Int16Array.from([-100, 0, 100]), 3, 1, P({ cuts: 'manual', lo: -100, hi: 100 }), '<i2', out)
    expect([out[0], out[4], out[8]]).toEqual([0, 128, 255])
  })

  it('does not divide by zero on a flat frame', () => {
    const out = new Uint8ClampedArray(2 * 4)
    stretchToRgba(Uint16Array.from([700, 700]), 2, 1, P(), '<u2', out)
    expect(Array.from(out)).toEqual([0, 0, 0, 255, 0, 0, 0, 255])
  })
})
