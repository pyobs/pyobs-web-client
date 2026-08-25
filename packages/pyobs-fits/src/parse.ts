import { parseHeader } from './header'
import { decodeImage } from './image'
import type { ParsedFits } from './types'

// Parses the primary HDU only. Multi-HDU files (extensions) aren't read —
// grab_data()'s output is a single-image primary HDU; add a loop over
// successive `dataOffset`s here if a future consumer needs extensions.
export function parseFits(buffer: ArrayBuffer): ParsedFits {
  const { header, dataOffset } = parseHeader(buffer, 0)
  const image = decodeImage(buffer, dataOffset, header)
  return { header, image }
}
