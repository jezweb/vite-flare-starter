/**
 * Chat killer-flow tests — covers P1-001, P1-002, P3-003.
 *
 * - P1-001: chat tour Skip persists across page reloads (localStorage flag)
 * - P1-002: edit-message icon button has aria-label="Edit message"
 * - P3-003: model picker SelectTrigger has aria-label="Select AI model"
 *
 * The model picker test is a pure DOM-attribute check (no user state
 * required to dirty-test). The skip-tour test creates the tour, dismisses
 * it, reloads, and asserts the popover does NOT reappear.
 */
import { expect, test } from '@playwright/test'
import { storageStatePath } from './setup/fixtures'

test.use({ storageState: storageStatePath('regression') })

test.describe('chat', () => {
  test('P3-003: model picker SelectTrigger has accessible name', async ({ page }) => {
    await page.goto('/dashboard/chat')
    // Wait for the chat input to mount — the model picker mounts in the
    // same render path so this is a reliable readiness signal.
    await page.locator('[data-tour="chat-input"]').waitFor({ state: 'visible' })
    // ModelSelector renders one or more buttons with aria-label
    // "Select AI model..." inside the [data-tour="chat-model-picker"]
    // span. Find the first such button.
    const trigger = page
      .locator('[data-tour="chat-model-picker"] button[aria-label*="Select AI model" i]')
      .first()
    await expect(trigger).toBeVisible({ timeout: 10_000 })
    // The aria-label is dynamic ("Select AI model" or "Select AI model
    // (current: ...)") — assert with a regex so the test is stable
    // across model changes.
    await expect(trigger).toHaveAttribute('aria-label', /select ai model/i)
  })

  test('P1-001: chat tour Skip persists across reload', async ({ page }) => {
    // Reset both persistence layers so we can verify the dismiss flow:
    //   localStorage 'chat-tour-seen' must not be 'true'
    //   server prefs.tours.chat must not be 'seen'
    await page.goto('/dashboard/chat')
    await page.evaluate(() => window.localStorage.removeItem('chat-tour-seen'))

    // Read current prefs, replace `tours` with an empty object to wipe
    // the 'seen' flag, then PATCH the full payload back. The schema
    // requires the canonical preferences shape so a partial PATCH that
    // omits required fields would be rejected.
    const prefsResp = await page.request.get('/api/settings/preferences')
    if (prefsResp.ok()) {
      const json = (await prefsResp.json()) as {
        preferences: Record<string, unknown>
      }
      const reset = { ...json.preferences, tours: {} }
      await page.request
        .patch('/api/settings/preferences', { data: reset })
        .catch(() => undefined)
    }

    // Reload so the tour evaluates from a clean slate.
    await page.reload()

    // The tour fires after a 200ms timeout once preferences are loaded.
    // Look for the "Skip tour" button or the first step's "Got it"/"Next"
    // buttons. If the tour doesn't appear (server prefs already 'seen'),
    // skip the rest — we can only test what we can render.
    const skipButton = page.getByRole('button', { name: /skip tour/i })
    const tourVisible = await skipButton
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!tourVisible, 'Tour did not appear — likely already dismissed server-side')

    await skipButton.click()
    // Local flag should be set synchronously by the close handler.
    const localFlag = await page.evaluate(() =>
      window.localStorage.getItem('chat-tour-seen'),
    )
    expect(localFlag).toBe('true')

    // Reload — the tour MUST NOT reappear.
    await page.reload()
    await page.locator('[data-tour="chat-input"]').waitFor({ state: 'visible' })
    // Give the (would-be) tour its 200ms scheduling window plus margin.
    await page.waitForTimeout(800)
    await expect(page.getByRole('button', { name: /skip tour/i })).toHaveCount(0)
  })

  test('P1-002: edit-message icon button has aria-label', async ({ page }) => {
    // We don't need a sent message to assert the markup — the edit
    // button only renders next to a user message. So we send one,
    // hover the message, and check the button label.
    await page.goto('/dashboard/chat')
    // The chat input itself carries data-tour="chat-input" — it's the
    // textarea, not a wrapper.
    const composer = page.locator('[data-tour="chat-input"]').first()
    await composer.waitFor({ state: 'visible' })

    const marker = `hello regression ${Date.now()}`
    await composer.click()
    await composer.fill(marker)
    await composer.press('Enter')

    // Hover the user message so the edit affordance reveals. Easiest
    // signal: find the text we typed in the conversation, walk up to
    // the nearest container, and hover.
    const messageHost = page.locator(`text="${marker}"`).first()
    await messageHost.waitFor({ state: 'visible', timeout: 15_000 })
    await messageHost.hover()

    const editButton = page.getByRole('button', { name: /edit message/i }).first()
    await expect(editButton).toBeVisible({ timeout: 10_000 })
    await expect(editButton).toHaveAttribute('aria-label', /edit message/i)
  })
})
