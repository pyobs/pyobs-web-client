const CARD_LENGTH = 80
const BLOCK_LENGTH = 2880

export function card(keyword: string, value?: string | number | boolean, comment?: string): string {
  if (value === undefined) return keyword.padEnd(CARD_LENGTH)

  let valueStr: string
  if (typeof value === 'string') valueStr = `'${value.replace(/'/g, "''")}'`.padEnd(20)
  else if (typeof value === 'boolean') valueStr = (value ? 'T' : 'F').padStart(20)
  else valueStr = String(value).padStart(20)

  let line = keyword.padEnd(8) + '= ' + valueStr
  if (comment) line += ' / ' + comment
  return line.padEnd(CARD_LENGTH).slice(0, CARD_LENGTH)
}

function toAsciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
  return bytes
}

export function buildHeaderBytes(cards: string[]): Uint8Array {
  const text = cards.join('') + 'END'.padEnd(CARD_LENGTH)
  const blockLength = Math.ceil(text.length / BLOCK_LENGTH) * BLOCK_LENGTH
  return toAsciiBytes(text.padEnd(blockLength, ' '))
}

// `Uint8Array.buffer.slice()` types as `ArrayBuffer | SharedArrayBuffer`
// even though a freshly-built Uint8Array is never SharedArrayBuffer-backed.
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

// Standard-shaped image: SIMPLE/BITPIX/NAXIS/NAXIS1/NAXIS2 cards followed by
// any extra cards, then the given raw pixel bytes (already in FITS's
// big-endian on-disk layout), header- and data-block-padded to 2880 bytes.
export function buildFits(
  opts: { bitpix: number; width: number; height: number; bzero?: number; bscale?: number; extraCards?: string[] },
  pixelBytes: Uint8Array,
): ArrayBuffer {
  const cards = [
    card('SIMPLE', true),
    card('BITPIX', opts.bitpix),
    card('NAXIS', 2),
    card('NAXIS1', opts.width),
    card('NAXIS2', opts.height),
    ...(opts.bzero !== undefined ? [card('BZERO', opts.bzero)] : []),
    ...(opts.bscale !== undefined ? [card('BSCALE', opts.bscale)] : []),
    ...(opts.extraCards ?? []),
  ]
  const header = buildHeaderBytes(cards)
  const dataBlockLength = Math.max(Math.ceil(pixelBytes.length / BLOCK_LENGTH) * BLOCK_LENGTH, BLOCK_LENGTH)

  const buffer = new ArrayBuffer(header.length + dataBlockLength)
  new Uint8Array(buffer, 0, header.length).set(header)
  new Uint8Array(buffer, header.length, pixelBytes.length).set(pixelBytes)
  return buffer
}
