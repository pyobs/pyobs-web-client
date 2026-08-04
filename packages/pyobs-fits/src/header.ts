import type { FitsCard, FitsCardValue } from './types'
import { FitsHeader } from './types'

const CARD_LENGTH = 80
const BLOCK_LENGTH = 2880 // 36 cards per header block

function parseValue(raw: string): { value: FitsCardValue; comment?: string } {
  const s = raw.trimStart()

  if (s.startsWith("'")) {
    // String value: single-quoted, embedded '' is a literal quote. Trailing
    // blanks inside the quotes aren't significant per the FITS standard.
    let value = ''
    let i = 1
    for (; i < s.length; i++) {
      if (s[i] === "'") {
        if (s[i + 1] === "'") {
          value += "'"
          i++
        } else {
          i++
          break
        }
      } else {
        value += s[i]
      }
    }
    const rest = s.slice(i).trim().replace(/^\/\s*/, '')
    return { value: value.replace(/\s+$/, ''), comment: rest || undefined }
  }

  const slashIndex = s.indexOf('/')
  const token = (slashIndex === -1 ? s : s.slice(0, slashIndex)).trim()
  const comment = slashIndex === -1 ? undefined : s.slice(slashIndex + 1).trim() || undefined

  let value: FitsCardValue
  if (token === 'T') value = true
  else if (token === 'F') value = false
  else if (/^[+-]?\d+$/.test(token)) value = parseInt(token, 10)
  else if (token !== '' && !isNaN(Number(token))) value = Number(token)
  else value = token

  return { value, comment }
}

// Parses 80-byte header cards starting at `byteOffset` until an END card,
// then returns the offset of the first byte after the header block (padded
// to the next 2880-byte boundary), which is where pixel data begins.
// Doesn't handle CONTINUE cards or multi-HDU files — out of scope for the
// single-primary-HDU-image case this package targets (see README).
export function parseHeader(buffer: ArrayBuffer, byteOffset: number): { header: FitsHeader; dataOffset: number } {
  const bytes = new Uint8Array(buffer, byteOffset)
  const decoder = new TextDecoder('latin1')
  const cards: FitsCard[] = []

  let cardIndex = 0
  for (; ; cardIndex++) {
    const start = cardIndex * CARD_LENGTH
    if (start + CARD_LENGTH > bytes.length) {
      throw new Error('FITS header: ran out of data before an END card')
    }
    const text = decoder.decode(bytes.subarray(start, start + CARD_LENGTH))
    const keyword = text.slice(0, 8).trim()

    if (keyword === 'END') {
      cardIndex++
      break
    }
    if (keyword === '' || keyword === 'COMMENT' || keyword === 'HISTORY') {
      cards.push({ keyword, value: null, comment: text.slice(8).trim() || undefined })
      continue
    }
    if (text.slice(8, 10) === '= ') {
      cards.push({ keyword, ...parseValue(text.slice(10)) })
    } else {
      cards.push({ keyword, value: null })
    }
  }

  const headerBlockBytes = Math.ceil((cardIndex * CARD_LENGTH) / BLOCK_LENGTH) * BLOCK_LENGTH
  return { header: new FitsHeader(cards), dataOffset: byteOffset + headerBlockBytes }
}
