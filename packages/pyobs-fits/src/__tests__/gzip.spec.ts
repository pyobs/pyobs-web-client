import { describe, expect, it } from 'vitest'
import { maybeGunzip } from '../gzip'

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  // See gzip.ts's comment on the same lib.dom typing gap.
  const compressed = readable.pipeThrough(
    new CompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  )
  return new Uint8Array(await new Response(compressed).arrayBuffer())
}

describe('maybeGunzip', () => {
  it('decompresses gzip-magic bytes', async () => {
    const original = new Uint8Array([1, 2, 3, 4, 5])
    const compressed = await gzip(original)

    const result = await maybeGunzip(compressed)

    expect(Array.from(result)).toEqual(Array.from(original))
  })

  it('passes non-gzip bytes through unchanged', async () => {
    const bytes = new Uint8Array([0x53, 0x49, 0x4d, 0x50]) // 'SIMP'
    const result = await maybeGunzip(bytes)
    expect(result).toBe(bytes)
  })
})
