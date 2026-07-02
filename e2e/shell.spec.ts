import { test, expect } from './fixtures'

async function openShell(page: import('@playwright/test').Page) {
  await page.click('text=Shell')
  const moduleSelect = page.locator('select').nth(0)
  const methodSelect = page.locator('select').nth(1)
  const optionCount = await moduleSelect.locator('option').count()
  expect(optionCount).toBeGreaterThan(1) // more than just the placeholder
  await moduleSelect.selectOption({ index: 1 })
  return { moduleSelect, methodSelect }
}

test.describe('Shell', () => {
  test('method select populates, grouped by interface, once a module is picked', async ({ connectedPage: page }) => {
    const { methodSelect } = await openShell(page)
    await expect(methodSelect).toBeEnabled()
    await expect(methodSelect.locator('optgroup').first()).toBeAttached()
    const methodCount = await methodSelect.locator('option').count()
    expect(methodCount).toBeGreaterThan(1)
  })

  test('IModule.reset_error executes and returns a real RPC result', async ({ connectedPage: page }) => {
    // Every module implements IModule; reset_error takes no params and is a
    // safe no-op when there's no error to reset — good generic smoke test
    // for the full RPC round trip without depending on any specific device.
    const { methodSelect } = await openShell(page)
    const hasResetError = await methodSelect.locator('option', { hasText: 'reset_error' }).count()
    test.skip(hasResetError === 0, 'connected module does not implement IModule.reset_error')

    await methodSelect.selectOption({ label: 'reset_error' })
    await expect(page.getByText('No parameters.')).toBeVisible()

    await page.getByRole('button', { name: /execute/i }).click()
    await expect(page.getByText(/^(Result|Error)/)).toBeVisible({ timeout: 10000 })
  })

  test('an enum-typed param renders as a populated dropdown', async ({ connectedPage: page }) => {
    // Only present if the connected module implements IImageFormat — degrade
    // gracefully rather than assuming every environment has this interface.
    const { methodSelect } = await openShell(page)
    const hasSetImageFormat = await methodSelect.locator('option', { hasText: 'set_image_format' }).count()
    test.skip(hasSetImageFormat === 0, 'connected module does not implement IImageFormat.set_image_format')

    await methodSelect.selectOption({ label: 'set_image_format' })
    const enumSelect = page.locator('select').nth(2)
    const optionCount = await enumSelect.locator('option').count()
    expect(optionCount).toBeGreaterThan(1) // placeholder + at least one enum value

    // Picking a value must actually take (regression check for the select
    // rendering blank because its bound value matched no <option>).
    await enumSelect.selectOption({ index: 1 })
    await expect(enumSelect).not.toHaveValue('')
  })

  test('an RPC-level fault surfaces the exception class and message', async ({ connectedPage: page }) => {
    // Only present if the connected module implements IConfig.
    const { methodSelect } = await openShell(page)
    const hasGetConfigValue = await methodSelect.locator('option', { hasText: 'get_config_value' }).count()
    test.skip(hasGetConfigValue === 0, 'connected module does not implement IConfig.get_config_value')

    await methodSelect.selectOption({ label: 'get_config_value' })
    await page.locator('input.form-control.form-control-sm').first().fill('this_key_almost_certainly_does_not_exist')
    await page.getByRole('button', { name: /execute/i }).click()

    const errorHeading = page.getByText(/^Error/)
    await expect(errorHeading).toBeVisible({ timeout: 10000 })
    await expect(errorHeading).toHaveText(/^Error: \w+/) // "Error: <ExceptionClass>"
  })
})
