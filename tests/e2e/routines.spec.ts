/**
 * Routines killer-flow tests — covers P4-001, P2-005, list-renders.
 *
 * - P4-001: new-routine form persists field values across sidebar
 *   navigation away + back (sessionStorage-backed draft).
 * - P2-005: /api/routines/:id/fire returns 202 promptly (within 30s)
 *   so the UI never hangs waiting on a stalled run. The watchdog logic
 *   on the server enforces a 2min cap on the run itself.
 * - Routine list renders after creating one (smoke test of the index).
 */
import { expect, test } from '@playwright/test'
import { apiContext, storageStatePath } from './setup/fixtures'

test.use({ storageState: storageStatePath('regression') })

test.describe('routines', () => {
  test('P4-001: new-routine form persists across navigation away and back', async ({
    page,
  }) => {
    await page.goto('/dashboard/routines/new')
    await page.locator('#name').waitFor({ state: 'visible' })

    const uniqueName = `Persisted draft ${Date.now()}`
    const uniqueDescription =
      'Description that should survive a sidebar click + return.'

    await page.locator('#name').fill(uniqueName)
    await page.locator('#description').fill(uniqueDescription)

    // Navigate away to a different page, then return to the new-routine
    // form. The sessionStorage-backed draft should restore both fields.
    await page.goto('/dashboard/inbox')
    await page.waitForLoadState('domcontentloaded')

    await page.goto('/dashboard/routines/new')
    await page.locator('#name').waitFor({ state: 'visible' })

    await expect(page.locator('#name')).toHaveValue(uniqueName)
    await expect(page.locator('#description')).toHaveValue(uniqueDescription)
  })

  test('P2-005: /fire endpoint returns promptly (queues async)', async ({ page }) => {
    const api = await apiContext('regression')

    // Create a minimal routine via the API — using an Assistant agent
    // and a 24h interval so it doesn't queue extra fires during the
    // test. agentName is required + must be unique per agentClass.
    const instance = `e2e-fire-${Date.now()}`
    const createResp = await api.post('/api/routines', {
      data: {
        agentClass: 'AssistantAgent',
        agentName: instance,
        name: `e2e fire test ${instance}`,
        description: 'Created by Playwright e2e — safe to delete.',
        triggerKind: 'schedule',
        baseInterval: 86400,
        minInterval: 86400,
        maxInterval: 86400,
        enabled: false,
        inputTemplate: 'Just respond "ack". No tools required.',
        toolsAllowed: [],
        skillsLoaded: [],
        // hooks is a record, not an array.
        hooks: {},
      },
    })

    if (!createResp.ok()) {
      // Routine schema may have evolved; surface the error verbatim.
      const body = await createResp.text()
      await api.dispose()
      throw new Error(`routine create failed: ${createResp.status()} ${body}`)
    }

    const created = (await createResp.json()) as { id: string }
    try {
      // /fire should return 202 within a few seconds (it queues the
      // run via waitUntil and returns immediately).
      const start = Date.now()
      const fireResp = await api.post(`/api/routines/${created.id}/fire`, {
        data: {},
      })
      const elapsed = Date.now() - start
      expect(fireResp.status()).toBe(202)
      expect(elapsed).toBeLessThan(30_000)
    } finally {
      await api.delete(`/api/routines/${created.id}`).catch(() => undefined)
      await api.dispose()
    }
  })

  test('routines index renders without error', async ({ page }) => {
    await page.goto('/dashboard/routines')
    await expect(
      page.getByRole('heading', { name: /routines/i }).first(),
    ).toBeVisible({ timeout: 10_000 })
    // The page renders with EITHER routine cards or an empty state —
    // both are acceptable. Just assert no error boundary is shown.
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0)
  })
})
