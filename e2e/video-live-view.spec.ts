import { test, expect, XMPP_TEST_JID } from './fixtures'

// Needs a BaseVideo module (pyobs-core >= 2.13.0) online, e.g.
// testing/pyobs-gui-configs/xmpp/video.yaml, reachable from the browser. The module's JID and the
// VFS root/base URL its stream lives under are configurable, defaulting to that config's values.
const VIDEO_JID = process.env.VIDEO_TEST_JID ?? `video@${XMPP_TEST_JID?.split('@')[1] ?? 'localhost'}`
const VFS_ROOT = process.env.VIDEO_TEST_VFS_ROOT ?? 'webcam'
const VFS_BASE_URL = process.env.VIDEO_TEST_VFS_BASE_URL ?? 'http://localhost:37077/'

test.describe('Live view, MJPEG stretch controls', () => {
  test('changing the stretch reconnects the stream with the new query parameters', async ({ connectedPage: page }) => {
    // The stream URL comes from a VFS endpoint stored per account; seed it instead of clicking
    // through Settings. Only matters on the next navigation, which is the goto below.
    const bareJid = XMPP_TEST_JID!
    await page.evaluate(
      ([jid, root, baseUrl]) => {
        localStorage.setItem('pyobs_vfs_config', JSON.stringify({ [jid]: [{ root, baseUrl }] }))
      },
      [bareJid, VFS_ROOT, VFS_BASE_URL],
    )

    const streamRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/video.mjpg')) streamRequests.push(req.url())
    })

    await page.goto(`/video-live/${encodeURIComponent(VIDEO_JID)}`)
    const controls = page.getByTestId('stretch-controls')
    test.skip(
      !(await controls.isVisible({ timeout: 20000 }).catch(() => false)),
      `no live view for ${VIDEO_JID}: is a BaseVideo module online and its VFS endpoint resolvable?`,
    )

    const img = page.getByAltText('Live view')
    await expect(img).toHaveAttribute('src', /\/video\.mjpg/)
    // Untouched settings: bare URL, nothing extra sent
    await expect(img).not.toHaveAttribute('src', /stretch=/)

    await page.getByTestId('stretch').selectOption('asinh')

    // Debounced, then the <img> reloads from a URL carrying the parameter, and the browser issues it.
    await expect(img).toHaveAttribute('src', /stretch=asinh/)
    await expect.poll(() => streamRequests.some((u) => u.includes('stretch=asinh'))).toBe(true)
  })
})
