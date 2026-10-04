// Zoom/pan geometry for the raw live view (issue #58 phase c). Everything here is in full-frame,
// unbinned pixel coordinates, the coordinates BaseVideo's `x`, `y`, `w`, `h` crop uses; a received
// frame maps back to them through its CROP-X / CROP-Y / SWBIN meta.
import type { FrameMeta } from '@/utils/rawFrameParser'

export type Rect = { x: number; y: number; w: number; h: number }
export type Size = { w: number; h: number }

export const MIN_VIEW_WIDTH = 16
export const MAX_ZOOM = 64
// How much extra the requested crop covers on each side of the view, so small pans don't need a
// reconnect, as a fraction of the view's size.
export const CROP_MARGIN = 0.25
// Reconnect for a tighter crop once the requested one is this many times the view's area.
const RECONNECT_AREA_RATIO = 2.5

export const fullRect = (full: Size): Rect => ({ x: 0, y: 0, w: full.w, h: full.h })
const area = (r: Rect) => r.w * r.h

export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

export function intersect(a: Rect, b: Rect): Rect | undefined {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.w, b.x + b.w)
  const bottom = Math.min(a.y + a.h, b.y + b.h)
  return right > x && bottom > y ? { x, y, w: right - x, h: bottom - y } : undefined
}

// Moves `r` inside `full` without changing its size (which must already fit).
function clampInside(full: Size, r: Rect): Rect {
  return {
    ...r,
    x: Math.min(Math.max(r.x, 0), full.w - r.w),
    y: Math.min(Math.max(r.y, 0), full.h - r.h),
  }
}

// Zooms the view by `factor` (>1 zooms in), keeping the point under `anchor` where it is on screen.
// The view keeps the frame's aspect ratio. Returns undefined once it would show the whole frame.
export function zoomView(full: Size, view: Rect | undefined, factor: number, anchor?: { x: number; y: number }): Rect | undefined {
  const cur = view ?? fullRect(full)
  const minW = Math.max(MIN_VIEW_WIDTH, full.w / MAX_ZOOM)
  const w = Math.min(full.w, Math.max(minW, cur.w / factor))
  if (w >= full.w) return undefined
  const scale = w / cur.w
  const h = cur.h * scale
  const ax = anchor?.x ?? cur.x + cur.w / 2
  const ay = anchor?.y ?? cur.y + cur.h / 2
  // the anchor keeps its relative position inside the view
  const x = ax - (ax - cur.x) * scale
  const y = ay - (ay - cur.y) * scale
  return clampInside(full, { x, y, w, h })
}

export function panView(full: Size, view: Rect, dx: number, dy: number): Rect {
  return clampInside(full, { ...view, x: view.x + dx, y: view.y + dy })
}

// The crop to request for `view`: the view plus a margin, inside the frame, in whole pixels (the
// server takes integers). Undefined means no crop, the whole frame.
export function cropFor(full: Size, view: Rect | undefined): Rect | undefined {
  if (!view || view.w >= full.w) return undefined
  const mx = view.w * CROP_MARGIN
  const my = view.h * CROP_MARGIN
  const x = Math.max(0, Math.floor(view.x - mx))
  const y = Math.max(0, Math.floor(view.y - my))
  const right = Math.min(full.w, Math.ceil(view.x + view.w + mx))
  const bottom = Math.min(full.h, Math.ceil(view.y + view.h + my))
  if (right - x >= full.w && bottom - y >= full.h) return undefined
  return { x, y, w: right - x, h: bottom - y }
}

// Whether the stream currently requested (`crop`, undefined = whole frame) still serves `view`:
// it must contain it, and not be so much bigger that most of the bandwidth is wasted.
export function needsReconnect(full: Size, crop: Rect | undefined, view: Rect | undefined): boolean {
  const have = crop ?? fullRect(full)
  const want = view ?? fullRect(full)
  return !contains(have, want) || area(have) > RECONNECT_AREA_RATIO * area(want)
}

// The full-frame region a received frame covers. Binning drops a remainder, so this is the frame's
// own size times the binning, not the requested crop's.
export function frameCoverage(meta: FrameMeta, frameW: number, frameH: number): Rect {
  const bin = meta.SWBIN ?? 1
  return { x: meta['CROP-X'] ?? 0, y: meta['CROP-Y'] ?? 0, w: frameW * bin, h: frameH * bin }
}

// `region` (full-frame coordinates) in the pixel coordinates of the frame it came from.
export function toFramePixels(meta: FrameMeta, region: Rect): Rect {
  const bin = meta.SWBIN ?? 1
  return {
    x: (region.x - (meta['CROP-X'] ?? 0)) / bin,
    y: (region.y - (meta['CROP-Y'] ?? 0)) / bin,
    w: region.w / bin,
    h: region.h / bin,
  }
}

// A position inside the displayed canvas (CSS pixels, 0..cssW) to full-frame coordinates, given the
// full-frame region currently drawn into it.
export function canvasToFull(drawn: Rect, cssSize: Size, px: number, py: number): { x: number; y: number } {
  return { x: drawn.x + (px / cssSize.w) * drawn.w, y: drawn.y + (py / cssSize.h) * drawn.h }
}

// Index into a frame's data for a full-frame position, or undefined if the frame doesn't cover it.
export function frameIndexAt(meta: FrameMeta, frameW: number, frameH: number, fx: number, fy: number): number | undefined {
  const bin = meta.SWBIN ?? 1
  const col = Math.floor((fx - (meta['CROP-X'] ?? 0)) / bin)
  const row = Math.floor((fy - (meta['CROP-Y'] ?? 0)) / bin)
  return col >= 0 && row >= 0 && col < frameW && row < frameH ? row * frameW + col : undefined
}
