import { test, expect } from './fixtures'

test.describe('Logging', () => {
  test('renders without error and its controls work', async ({ connectedPage: page }) => {
    await page.click('text=Logging')
    await expect(page.getByRole('heading', { name: 'Logging' })).toBeVisible()
    await expect(page.locator('select')).toBeVisible() // module filter
    await expect(page.getByRole('button', { name: /clear/i })).toBeVisible()

    // Either real LogEvents arrived by now, or the empty-state placeholder
    // shows — either is fine, but the page must render one of them cleanly,
    // not an empty void (this was silently broken pre-fix: events published
    // to urn:pyobs:event:LogEvent:1 weren't matched by the old unversioned
    // node-prefix check, so nothing ever rendered here at all).
    const table = page.locator('table')
    const emptyState = page.getByText('No log events yet.')
    await expect(table.or(emptyState)).toBeVisible({ timeout: 10000 })
  })

  test('receives live LogEvents once something logs (triggered via a Shell RPC call)', async ({ connectedPage: page }) => {
    // Trigger at least one log line for real: IModule.reset_error is safe
    // and pyobs-core logs at INFO/ERROR around most RPC calls.
    await page.click('text=Shell')
    const methodSelect = page.locator('select').nth(1)
    await page.locator('select').nth(0).selectOption({ index: 1 })
    const hasResetError = await methodSelect.locator('option', { hasText: 'reset_error' }).count()
    test.skip(hasResetError === 0, 'connected module does not implement IModule.reset_error')
    await methodSelect.selectOption({ label: 'reset_error' })
    await page.getByRole('button', { name: /execute/i }).click()
    await expect(page.getByText(/^(Result|Error)/)).toBeVisible({ timeout: 10000 })

    await page.click('text=Logging')
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 15000 })
  })
})
