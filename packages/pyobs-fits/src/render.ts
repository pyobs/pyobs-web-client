import type { FitsImage } from './types'

export function computeMinMax(pixels: Float64Array): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const v of pixels) {
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}

// A stretch maps physical pixel values to displayable 0-255 grayscale.
// Swap this out for e.g. zscale later without touching toImageData.
export type Stretch = (pixels: Float64Array) => Uint8ClampedArray

export function minMaxStretch(pixels: Float64Array, range = computeMinMax(pixels)): Uint8ClampedArray {
  const { min, max } = range
  const span = max - min || 1
  const out = new Uint8ClampedArray(pixels.length)
  for (let i = 0; i < pixels.length; i++) {
    out[i] = ((pixels[i]! - min) / span) * 255
  }
  return out
}

export interface RasterizedImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

// Rasterizes a decoded image to grayscale RGBA bytes, in ImageData's own
// layout — kept separate from toImageData below so this pure, allocation-only
// logic is unit-testable without a real `ImageData` constructor (jsdom, this
// project's unit-test environment, doesn't implement one). FITS defines row 1
// (the first row in the pixel array) as the *bottom* of the image, so this
// flips vertically to match on-screen (top-down) row order.
export function rasterize(image: FitsImage, stretch: Stretch = minMaxStretch): RasterizedImage {
  const { width, height, pixels } = image
  const gray = stretch(pixels)
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y
    for (let x = 0; x < width; x++) {
      const v = gray[srcRow * width + x]!
      const dst = (y * width + x) * 4
      data[dst] = v
      data[dst + 1] = v
      data[dst + 2] = v
      data[dst + 3] = 255
    }
  }

  return { data, width, height }
}

// Thin wrapper around rasterize() for actual <canvas> use
// (ctx.putImageData) — not unit-tested itself, see rasterize()'s comment.
export function toImageData(image: FitsImage, stretch: Stretch = minMaxStretch): ImageData {
  const { data, width, height } = rasterize(image, stretch)
  // Uint8ClampedArray's TS type is generic over its backing buffer as of
  // TS 5.7+; `new Uint8ClampedArray(n)` is always ArrayBuffer- (never
  // SharedArrayBuffer-) backed, but that isn't reflected in the inferred
  // type, so ImageData's constructor needs a nudge here.
  return new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height)
}
