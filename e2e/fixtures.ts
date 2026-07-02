import { test as base, expect, type Page } from '@playwright/test'

// Credentials for a real XMPP account to test with — never hardcode real
// credentials in the suite. Tests using `connectedPage` skip themselves
// (with a clear reason) when these aren't set, e.g. in CI.
export const XMPP_TEST_JID = process.env.XMPP_TEST_JID
export const XMPP_TEST_PASSWORD = process.env.XMPP_TEST_PASSWORD

async function login(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByPlaceholder('user@xmpp.example.com').fill(XMPP_TEST_JID!)
  await page.getByPlaceholder('••••••••').fill(XMPP_TEST_PASSWORD!)
  await page.getByRole('button', { name: /connect/i }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20000 })
}

// A freshly-connecting session only sees a module if it's already online
// when the connection is made — there's no roster-subscription-based
// presence redelivery in every ejabberd setup (see DEVELOPMENT.md). Treat
// "no module ever appeared" as an environment precondition, not a failure.
async function anyModuleCameOnline(page: Page): Promise<boolean> {
  try {
    await expect(page.locator('.status-dot').first()).toBeVisible({ timeout: 30000 })
    return true
  } catch {
    return false
  }
}

export const test = base.extend<{ connectedPage: Page }>({
  connectedPage: async ({ page }, use, testInfo) => {
    testInfo.skip(!XMPP_TEST_JID || !XMPP_TEST_PASSWORD, 'XMPP_TEST_JID / XMPP_TEST_PASSWORD not set')
    await login(page)
    const online = await anyModuleCameOnline(page)
    testInfo.skip(!online, 'No pyobs module came online within 30s — is one running and reachable?')
    await use(page)
  },
})

export { expect }
