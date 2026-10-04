import { describe, it, expect } from 'vitest'
import {
  canvasToFull,
  contains,
  cropFor,
  frameCoverage,
  frameIndexAt,
  intersect,
  needsReconnect,
  panView,
  toFramePixels,
  zoomView,
  MIN_VIEW_WIDTH,
} from '../utils/viewport'
import type { FrameMeta } from '../utils/rawFrameParser'

const FULL = { w: 2000, h: 1000 }
const meta = (m: Partial<FrameMeta> = {}): FrameMeta => ({ DTYPE: '<u2', NAXIS: 2, NAXIS1: 0, NAXIS2: 0, ...m })

describe('zoomView', () => {
  it('zooms around the centre, keeping the aspect ratio', () => {
    const v = zoomView(FULL, undefined, 2)!
    expect(v).toEqual({ x: 500, y: 250, w: 1000, h: 500 })
  })

  it('keeps the anchor point at the same relative position', () => {
    // anchor at 25% / 50% of the frame
    const v = zoomView(FULL, undefined, 4, { x: 500, y: 500 })!
    expect((500 - v.x) / v.w).toBeCloseTo(0.25, 9)
    expect((500 - v.y) / v.h).toBeCloseTo(0.5, 9)
    expect(v.w).toBe(500)
  })

  it('returns undefined when it would show the whole frame again', () => {
    const v = zoomView(FULL, undefined, 4)!
    expect(zoomView(FULL, v, 0.1)).toBeUndefined()
    expect(zoomView(FULL, undefined, 1)).toBeUndefined()
  })

  it('stays inside the frame when anchored near an edge', () => {
    const v = zoomView(FULL, undefined, 8, { x: 1990, y: 995 })!
    expect(contains({ x: 0, y: 0, ...FULL }, v)).toBe(true)
  })

  it('stops at the maximum zoom and a minimum view width', () => {
    let v = zoomView(FULL, undefined, 2)
    for (let i = 0; i < 30; i++) v = zoomView(FULL, v, 2)
    expect(v!.w).toBeGreaterThanOrEqual(MIN_VIEW_WIDTH)
    expect(FULL.w / v!.w).toBeLessThanOrEqual(64.0001)
  })
})

describe('panView', () => {
  it('moves the view and clamps it inside the frame', () => {
    const v = { x: 100, y: 100, w: 500, h: 250 }
    expect(panView(FULL, v, 50, -30)).toEqual({ x: 150, y: 70, w: 500, h: 250 })
    expect(panView(FULL, v, -999, -999)).toEqual({ x: 0, y: 0, w: 500, h: 250 })
    expect(panView(FULL, v, 99999, 99999)).toEqual({ x: 1500, y: 750, w: 500, h: 250 })
  })
})

describe('cropFor', () => {
  it('requests nothing when not zoomed', () => {
    expect(cropFor(FULL, undefined)).toBeUndefined()
  })

  it('adds a margin around the view, in whole pixels, clamped to the frame', () => {
    const c = cropFor(FULL, { x: 1000, y: 400, w: 400, h: 200 })!
    expect(c).toEqual({ x: 900, y: 350, w: 600, h: 300 })
    const edge = cropFor(FULL, { x: 0, y: 0, w: 400, h: 200 })!
    expect(edge).toEqual({ x: 0, y: 0, w: 500, h: 250 })
    const frac = cropFor(FULL, { x: 100.5, y: 100.5, w: 401, h: 200.5 })!
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(Number.isInteger(frac[k])).toBe(true)
    expect(contains(frac, { x: 100.5, y: 100.5, w: 401, h: 200.5 })).toBe(true)
  })

  it('requests nothing when the margin swallows the whole frame', () => {
    expect(cropFor(FULL, { x: 100, y: 50, w: 1800, h: 900 })).toBeUndefined()
  })
})

describe('needsReconnect', () => {
  const view = { x: 1000, y: 400, w: 400, h: 200 }

  it('keeps the stream while the view stays inside the crop', () => {
    const crop = cropFor(FULL, view)
    expect(needsReconnect(FULL, crop, view)).toBe(false)
    expect(needsReconnect(FULL, crop, { ...view, x: 1050 })).toBe(false)
  })

  it('reconnects when the view leaves the crop', () => {
    expect(needsReconnect(FULL, cropFor(FULL, view), { ...view, x: 1200 })).toBe(true)
  })

  it('reconnects for a tighter crop after zooming in a lot, not for a little', () => {
    const crop = cropFor(FULL, view)
    const slightly = zoomView(FULL, view, 1.03)!
    const lots = zoomView(FULL, view, 2)!
    expect(needsReconnect(FULL, crop, slightly)).toBe(false)
    expect(needsReconnect(FULL, crop, lots)).toBe(true)
  })

  it('reconnects when zooming in from the whole frame, and when zooming back out', () => {
    expect(needsReconnect(FULL, undefined, zoomView(FULL, undefined, 2))).toBe(true)
    expect(needsReconnect(FULL, cropFor(FULL, view), undefined)).toBe(true)
    expect(needsReconnect(FULL, undefined, undefined)).toBe(false)
  })
})

describe('mapping frame pixels to the full frame', () => {
  const cropped = meta({ 'CROP-X': 900, 'CROP-Y': 350, SWBIN: 2 })

  it('computes the region a binned crop covers, dropping the remainder', () => {
    expect(frameCoverage(cropped, 300, 150)).toEqual({ x: 900, y: 350, w: 600, h: 300 })
    // a 601 px wide crop binned by 2 yields 300 columns, covering 600 px
    expect(frameCoverage(meta({ 'CROP-X': 0, 'CROP-Y': 0, SWBIN: 2 }), 300, 10).w).toBe(600)
  })

  it('defaults to the whole frame at bin 1 when the meta has no crop keys', () => {
    expect(frameCoverage(meta(), 640, 480)).toEqual({ x: 0, y: 0, w: 640, h: 480 })
  })

  it('converts a full-frame region to frame pixels and back through the index', () => {
    expect(toFramePixels(cropped, { x: 1000, y: 400, w: 400, h: 200 })).toEqual({ x: 50, y: 25, w: 200, h: 100 })
    // full-frame (1000, 400) is column 50, row 25 of a 300-wide frame
    expect(frameIndexAt(cropped, 300, 150, 1000, 400)).toBe(25 * 300 + 50)
    // the two full-frame pixels of one binned pixel map to the same index
    expect(frameIndexAt(cropped, 300, 150, 1001, 401)).toBe(25 * 300 + 50)
  })

  it('returns no index outside the frame', () => {
    expect(frameIndexAt(cropped, 300, 150, 899, 400)).toBeUndefined()
    expect(frameIndexAt(cropped, 300, 150, 1500, 400)).toBeUndefined()
    expect(frameIndexAt(cropped, 300, 150, 1000, 650)).toBeUndefined()
  })

  it('maps a canvas position to the full frame through the drawn region', () => {
    const drawn = { x: 1000, y: 400, w: 400, h: 200 }
    expect(canvasToFull(drawn, { w: 800, h: 400 }, 0, 0)).toEqual({ x: 1000, y: 400 })
    expect(canvasToFull(drawn, { w: 800, h: 400 }, 400, 200)).toEqual({ x: 1200, y: 500 })
    expect(canvasToFull(drawn, { w: 800, h: 400 }, 800, 400)).toEqual({ x: 1400, y: 600 })
  })
})

describe('intersect', () => {
  it('returns the overlap, or undefined', () => {
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({ x: 5, y: 5, w: 5, h: 5 })
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBeUndefined()
  })
})
