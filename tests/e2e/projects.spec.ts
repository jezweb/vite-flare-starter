/**
 * Projects killer-flow tests — covers P4-020.
 *
 * P4-020: bare <select> with no name/id/aria-label triggers axe-core's
 * select-name violation. Verify the sort dropdown has the explicit
 * aria-label="Sort projects".
 */
import { expect, test } from '@playwright/test'
import { storageStatePath } from './setup/fixtures'

test.use({ storageState: storageStatePath('regression') })

test('P4-020: projects sort dropdown has aria-label', async ({ page }) => {
  await page.goto('/dashboard/projects')
  // Sort dropdown is a native <select> with aria-label="Sort projects".
  const sortSelect = page.locator('select[aria-label="Sort projects"]')
  await expect(sortSelect).toBeVisible({ timeout: 10_000 })
  await expect(sortSelect).toHaveAttribute('aria-label', 'Sort projects')
})
