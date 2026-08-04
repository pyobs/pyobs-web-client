import type { Bitpix, FitsHeader, FitsImage } from './types'

const VALID_BITPIX = new Set([8, 16, 32, 64, -32, -64])

function readRaw(view: DataView, byteOffset: number, bitpix: Bitpix): number {
  switch (bitpix) {
    case 8:
      return view.getUint8(byteOffset)
    case 16:
      return view.getInt16(byteOffset, false)
    case 32:
      return view.getInt32(byteOffset, false)
    case 64:
      return Number(view.getBigInt64(byteOffset, false))
    case -32:
      return view.getFloat32(byteOffset, false)
    case -64:
      return view.getFloat64(byteOffset, false)
  }
}

// Decodes the pixel data of a single 2D image HDU (NAXIS 2 — a data cube's
// later planes, NAXIS 3+, aren't read; see README for why compressed/table
// HDUs are out of scope entirely). FITS is always big-endian on the wire.
export function decodeImage(buffer: ArrayBuffer, dataOffset: number, header: FitsHeader): FitsImage {
  const naxis = header.get('NAXIS')
  if (typeof naxis !== 'number' || naxis < 2) {
    throw new Error(`FITS image: expected NAXIS >= 2, got ${String(naxis)}`)
  }

  const bitpix = header.get('BITPIX')
  if (typeof bitpix !== 'number' || !VALID_BITPIX.has(bitpix)) {
    throw new Error(`FITS image: unsupported BITPIX ${String(bitpix)}`)
  }

  const width = header.get('NAXIS1')
  const height = header.get('NAXIS2')
  if (typeof width !== 'number' || typeof height !== 'number') {
    throw new Error('FITS image: missing NAXIS1/NAXIS2')
  }

  const bzero = (header.get('BZERO') as number | undefined) ?? 0
  const bscale = (header.get('BSCALE') as number | undefined) ?? 1

  const bytesPerPixel = Math.abs(bitpix) / 8
  const pixelCount = width * height
  const view = new DataView(buffer, dataOffset, pixelCount * bytesPerPixel)

  const pixels = new Float64Array(pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    pixels[i] = bzero + bscale * readRaw(view, i * bytesPerPixel, bitpix as Bitpix)
  }

  return { width, height, bitpix: bitpix as Bitpix, bzero, bscale, pixels }
}
