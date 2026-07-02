import { test, expect } from './fixtures'

test.describe('Dashboard', () => {
  function firstModuleCard(page: import('@playwright/test').Page) {
    return page.locator('.rounded-3.p-3', { has: page.locator('.status-dot') }).first()
  }

  test('renders at least one connected module with its live interface badges', async ({ connectedPage: page }) => {
    const card = firstModuleCard(page)
    await expect(card).toBeVisible()

    // Every module implements IModule, so it always advertises at least one
    // versioned interface badge (e.g. "IModule:1") sourced live from disco#info.
    const badges = card.locator('.badge')
    await expect(badges.first()).toBeVisible()
    await expect(badges.first()).toHaveText(/^\w+:\d+$/)
  })

  test('renders capability/state cards as generic key/value pairs, not raw JSON', async ({ connectedPage: page }) => {
    const moduleCard = firstModuleCard(page)
    const kvCards = moduleCard.locator('.rounded-3.p-2.mb-2')
    const count = await kvCards.count()
    test.skip(count === 0, 'connected module published no capabilities or state to check')

    const first = kvCards.first()
    // A key/value card has a title row plus at least one "label value" row —
    // never a raw '{' from an un-rendered object.
    await expect(first).not.toContainText('{')
  })
})
