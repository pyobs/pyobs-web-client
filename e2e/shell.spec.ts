import { test, expect } from './fixtures'

async function openShell(page: import('@playwright/test').Page) {
  await page.click('text=Shell')
  const modulePicker = page.getByTestId('shell-modules')
  const moduleButtons = modulePicker.locator('button')
  const moduleCount = await moduleButtons.count()
  expect(moduleCount).toBeGreaterThan(0)
  await moduleButtons.first().click()
  return { methodPicker: page.getByTestId('shell-methods') }
}

test.describe('Shell', () => {
  test('method buttons populate, grouped by interface, once a module is picked', async ({ connectedPage: page }) => {
    const { methodPicker } = await openShell(page)
    await expect(methodPicker).toBeVisible()
    const methodCount = await methodPicker.locator('button').count()
    expect(methodCount).toBeGreaterThan(0)
  })

  test('IModule.reset_error executes and appends a result to the log', async ({ connectedPage: page }) => {
    // Every module implements IModule; reset_error takes no params and is a
    // safe no-op when there's no error to reset — good generic smoke test
    // for the full RPC round trip without depending on any specific device.
    const { methodPicker } = await openShell(page)
    const resetErrorButton = methodPicker.getByRole('button', { name: 'reset_error', exact: true })
    test.skip((await resetErrorButton.count()) === 0, 'connected module does not implement IModule.reset_error')

    await resetErrorButton.click()
    await expect(page.getByText('No parameters.')).toBeVisible()

    await page.getByRole('button', { name: /execute/i }).click()
    await expect(page.getByTestId('shell-log').getByText(/reset_error/)).toBeVisible({ timeout: 10000 })
  })

  test('an enum-typed param renders as a populated dropdown', async ({ connectedPage: page }) => {
    // Only present if the connected module implements IImageFormat — degrade
    // gracefully rather than assuming every environment has this interface.
    const { methodPicker } = await openShell(page)
    const setImageFormatButton = methodPicker.getByRole('button', { name: 'set_image_format', exact: true })
    test.skip((await setImageFormatButton.count()) === 0, 'connected module does not implement IImageFormat.set_image_format')

    await setImageFormatButton.click()
    const enumSelect = page.getByTestId('shell-params').locator('select')
    const optionCount = await enumSelect.locator('option').count()
    expect(optionCount).toBeGreaterThan(1) // placeholder + at least one enum value

    // Picking a value must actually take (regression check for the select
    // rendering blank because its bound value matched no <option>).
    await enumSelect.selectOption({ index: 1 })
    await expect(enumSelect).not.toHaveValue('')
  })

  test('an RPC-level fault surfaces the exception class and message in the log', async ({ connectedPage: page }) => {
    // Only present if the connected module implements IConfig.
    const { methodPicker } = await openShell(page)
    const getConfigValueButton = methodPicker.getByRole('button', { name: 'get_config_value', exact: true })
    test.skip((await getConfigValueButton.count()) === 0, 'connected module does not implement IConfig.get_config_value')

    await getConfigValueButton.click()
    await page.getByTestId('shell-params').locator('input').first().fill('this_key_almost_certainly_does_not_exist')
    await page.getByRole('button', { name: /execute/i }).click()

    const logEntry = page.getByTestId('shell-log').locator('.text-danger').last()
    await expect(logEntry).toBeVisible({ timeout: 10000 })
    await expect(logEntry).toHaveText(/^\w+Error:/)
  })

  test('IConfig.get_config_value with an empty name surfaces the clean pyobs-core validation error', async ({
    connectedPage: page,
  }) => {
    // Only present if the connected module implements IConfig.
    const { methodPicker } = await openShell(page)
    const getConfigValueButton = methodPicker.getByRole('button', { name: 'get_config_value', exact: true })
    test.skip((await getConfigValueButton.count()) === 0, 'connected module does not implement IConfig.get_config_value')

    await getConfigValueButton.click()
    // Leave `name` untouched — non-optional string params default to '',
    // which the client must send as a real empty <string>, not <nil/> (that
    // was the earlier RPC-params-sent-as-None bug). This exercises
    // pyobs-core's own validation for an empty name (raises a clean
    // ValueError rather than a confusing "Invalid parameter None"), not a
    // client-side encoding bug.
    const nameInput = page.getByTestId('shell-params').locator('input').first()
    await expect(nameInput).toHaveValue('')
    await page.getByRole('button', { name: /execute/i }).click()

    const logEntry = page.getByTestId('shell-log').locator('.text-danger').last()
    await expect(logEntry).toBeVisible({ timeout: 10000 })
    await expect(logEntry).toHaveText('ValueError: No parameter name given.')
  })
})
