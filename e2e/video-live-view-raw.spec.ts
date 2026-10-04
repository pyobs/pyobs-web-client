import { test, expect, XMPP_TEST_JID } from './fixtures'

// Raw live view (phase b/c). Needs a BaseVideo module online AND the raw stream readable from the
// browser: same origin as the app, or a pyobs-core with CORS support (pyobs/pyobs-core#942). Skips
// itself when the stream can't be opened, instead of failing on a server limitation.
const VIDEO_JID = process.env.VIDEO_TEST_JID ?? `video@${XMPP_TEST_JID?.split('@')[1] ?? 'localhost'}`
const VFS_ROOT = process.env.VIDEO_TEST_VFS_ROOT ?? 'webcam'
const VFS_BASE_URL = process.env.VIDEO_TEST_VFS_BASE_URL ?? 'http://localhost:37077/'

test.describe('Live view, raw mode', () => {
  test('streams frames, and zooming requests a crop from the server', async ({ connectedPage: page }) => {
    await page.evaluate(
      ([jid, root, baseUrl]) => {
        localStorage.setItem('pyobs_vfs_config', JSON.stringify({ [jid]: [{ root, baseUrl }] }))
      },
      [XMPP_TEST_JID!, VFS_ROOT, VFS_BASE_URL],
    )

    const rawRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/video.raw')) rawRequests.push(req.url())
    })

    await page.goto(`/video-live/${encodeURIComponent(VIDEO_JID)}`)
    const toggle = page.getByTestId('mode-raw')
    test.skip(
      !(await toggle.isVisible({ timeout: 20000 }).catch(() => false)),
      `no raw mode for ${VIDEO_JID}: module offline, no raw path published, or a phone-sized viewport`,
    )
    await toggle.click()

    const canvas = page.getByTestId('raw-canvas')
    const streaming = await canvas.isVisible({ timeout: 15000 }).catch(() => false)
    test.skip(!streaming, "raw stream couldn't be opened (CORS not available on this BaseVideo?)")

    // Not blank: a frame was drawn.
    const hasContent = () =>
      canvas.evaluate((el) => {
        const c = el as unknown as {
          width: number
          height: number
          getContext(id: '2d'): { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } }
        }
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        for (let i = 0; i < d.length; i += 4) if (d[i] !== d[0]) return true
        return false
      })
    await expect.poll(hasContent).toBe(true)

    // Stretch changes are applied in the browser: no new request.
    const before = rawRequests.length
    await page.getByTestId('raw-stretch').selectOption('asinh')
    await page.waitForTimeout(500)
    expect(rawRequests.length).toBe(before)

    // Zooming in asks the server for a crop.
    await page.getByTestId('zoom-in').click()
    await page.getByTestId('zoom-in').click()
    await expect.poll(() => rawRequests.some((u) => /[?&]x=\d+&y=\d+&w=\d+&h=\d+/.test(u))).toBe(true)
    await expect.poll(hasContent).toBe(true)

    // Resetting the zoom goes back to the whole frame.
    await page.getByTestId('zoom-reset').click()
    await expect.poll(() => !/[?&]w=/.test(rawRequests[rawRequests.length - 1] ?? '')).toBe(true)
  })
})
