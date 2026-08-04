export type FitsCardValue = string | number | boolean | null

export interface FitsCard {
  keyword: string
  value: FitsCardValue
  comment?: string
}

export class FitsHeader {
  constructor(readonly cards: FitsCard[]) {}

  get(keyword: string): FitsCardValue | undefined {
    return this.cards.find((c) => c.keyword === keyword)?.value
  }

  contains(keyword: string): boolean {
    return this.cards.some((c) => c.keyword === keyword)
  }
}

// BITPIX values the FITS standard defines. 8 is unsigned; 16/32/64 are
// signed twos-complement; -32/-64 are IEEE float. All big-endian on the wire.
export type Bitpix = 8 | 16 | 32 | 64 | -32 | -64

export interface FitsImage {
  width: number
  height: number
  bitpix: Bitpix
  bzero: number
  bscale: number
  // Physical pixel values (bzero + bscale * raw), row-major, origin top-left
  // of the array as stored on disk (FITS itself defines row 1 as the
  // bottom — see render.ts for the flip applied when rasterizing).
  pixels: Float64Array
}

export interface ParsedFits {
  header: FitsHeader
  image: FitsImage
}
