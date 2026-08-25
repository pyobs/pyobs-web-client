const GZIP_MAGIC = [0x1f, 0x8b]

function isGzip(bytes: Uint8Array): boolean {
  return bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1]
}

// grab_data()'s returned VFS path is frequently `.fits.gz` (raw FITS,
// unconverted server-side). Decompresses via the browser's native
// DecompressionStream when gzip magic bytes are present; returns the input
// unchanged otherwise.
export async function maybeGunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (!isGzip(bytes)) return bytes

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  // lib.dom's CompressionStream/DecompressionStream types don't line up
  // with ReadableStream<Uint8Array>.pipeThrough's expected pair (a known
  // TS/DOM typing gap, not a real mismatch — both sides move Uint8Array
  // chunks at runtime).
  const decompressed = readable.pipeThrough(
    new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  )
  const buffer = await new Response(decompressed).arrayBuffer()
  return new Uint8Array(buffer)
}
