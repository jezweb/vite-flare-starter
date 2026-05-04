/**
 * Findings killer-flow tests — covers P2-003, P2-004, P4-005, P4-007, P4-008.
 *
 * - P2-003: promote-to-learning works on findings without `body` field
 * - P2-004: filter status persists in URL after reload
 * - P4-005: truncated row title has `title=` attribute
 * - P4-007: dismiss shows toast with Undo button
 * - P4-008: reopen button visible on dismissed findings, restores status
 */
import { expect, test } from '@playwright/test'
import {
  apiContext,
  deleteEntity,
  reopenFinding,
  seedFinding,
  storageStatePath,
} from './setup/fixtures'

test.use({ storageState: storageStatePath('regression') })

test.describe('findings', () => {
  test('P2-004: status filter persists in URL after reload', async ({ page }) => {
    await page.goto('/dashboard/findings')
    // Wait for the page to render the filter chips (or the empty state —
    // the filter row is rendered either way).
    await page.getByRole('heading', { name: /findings/i }).first().waitFor()

    // Click the "Open" filter chip.
    const openChip = page.getByRole('button', { name: /^open$/i }).first()
    await openChip.click()

    // URL should now include ?status=open.
    await expect(page).toHaveURL(/[?&]status=open/)

    // Reload — the URL param survives, and on rehydration the chip stays
    // in its active state (visually we trust the URL since the component
    // derives state from searchParams).
    await page.reload()
    await expect(page).toHaveURL(/[?&]status=open/)
  })

  test('P4-005: truncated row titles expose full text via title attribute', async ({
    page,
  }) => {
    const api = await apiContext('regression')
    const longTitle =
      'This is a very long finding title that should clip at the column edge and need a tooltip to read it in full'
    const seeded = await seedFinding(api, { title: longTitle, body: 'some body' })

    try {
      await page.goto('/dashboard/findings')
      const titleEl = page.locator(`p[title="${longTitle}"]`).first()
      await expect(titleEl).toBeVisible({ timeout: 10_000 })
      await expect(titleEl).toHaveAttribute('title', longTitle)
      await expect(titleEl).toHaveAttribute('aria-label', longTitle)
    } finally {
      await deleteEntity(api, seeded.id)
      await api.dispose()
    }
  })

  test('P2-003: promote-to-learning works on finding without body field', async ({ page }) => {
    const api = await apiContext('regression')
    // Seed a finding WITH an observation but no body — exactly the
    // shape that pre-P2-003 would have 400'd on promote.
    const resp = await api.post('/api/entities', {
      data: {
        type: 'finding',
        title: `e2e bodyless finding ${Date.now()}`,
        status: 'open',
        fields: {
          observation: 'Agent noticed something repeatedly.',
          recommendation: 'Add an automated check for this case.',
        },
      },
    })
    expect(resp.ok()).toBeTruthy()
    const seeded = (await resp.json()) as { id: string; title: string }

    try {
      await page.goto('/dashboard/findings?status=open')
      // Click the row to expand and reveal action buttons.
      const row = page.locator('p[title]').filter({ hasText: seeded.title }).first()
      await expect(row).toBeVisible({ timeout: 10_000 })
      await row.click()

      // Click Promote — must not 400. We assert via the toast that
      // appears on success ("Finding promoted to a learning").
      const promoteBtn = page
        .getByRole('button', { name: /promote to learning/i })
        .first()
      await promoteBtn.click()

      // Either a success toast OR the row's status badge flips to
      // 'promoted'. Either is sufficient evidence the request didn't 400.
      const successToast = page.getByText(/promoted to a learning/i).first()
      const errorToast = page.getByText(/promote failed|finding has no body/i).first()
      await Promise.race([
        successToast.waitFor({ state: 'visible', timeout: 10_000 }),
        errorToast
          .waitFor({ state: 'visible', timeout: 10_000 })
          .then(() => Promise.reject(new Error('Promote returned an error toast'))),
      ])
    } finally {
      await deleteEntity(api, seeded.id)
      await api.dispose()
    }
  })

  test('P4-007: dismiss shows toast with Undo button', async ({ page }) => {
    const api = await apiContext('regression')
    const seeded = await seedFinding(api, {
      title: `e2e dismiss-undo ${Date.now()}`,
      body: 'a finding ready to be dismissed',
    })

    try {
      await page.goto('/dashboard/findings?status=open')
      const row = page.locator('p[title]').filter({ hasText: seeded.title }).first()
      await expect(row).toBeVisible({ timeout: 10_000 })
      await row.click()

      const dismissBtn = page.getByRole('button', { name: /^dismiss$/i }).first()
      await dismissBtn.click()

      // The sonner toast should expose an Undo action button.
      const undoButton = page.getByRole('button', { name: /^undo$/i }).first()
      await expect(undoButton).toBeVisible({ timeout: 10_000 })
    } finally {
      // Make sure the row isn't left dismissed if the test already
      // succeeded; tests should clean up after themselves.
      await reopenFinding(api, seeded.id)
      await deleteEntity(api, seeded.id)
      await api.dispose()
    }
  })

  test('P4-008: dismissed findings show a Reopen button', async ({ page }) => {
    const api = await apiContext('regression')
    // Seed a finding directly in 'dismissed' state so we can verify the
    // Reopen affordance without depending on the dismiss flow.
    const seeded = await seedFinding(api, {
      title: `e2e reopen ${Date.now()}`,
      body: 'a finding pre-dismissed for reopen test',
      status: 'dismissed',
    })

    try {
      await page.goto('/dashboard/findings?status=dismissed')
      const row = page.locator('p[title]').filter({ hasText: seeded.title }).first()
      await expect(row).toBeVisible({ timeout: 10_000 })
      await row.click()

      const reopenBtn = page.getByRole('button', { name: /^reopen$/i }).first()
      await expect(reopenBtn).toBeVisible({ timeout: 5_000 })

      // Click reopen and verify the toast confirms it.
      await reopenBtn.click()
      await expect(page.getByText(/finding reopened/i).first()).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await deleteEntity(api, seeded.id)
      await api.dispose()
    }
  })
})
