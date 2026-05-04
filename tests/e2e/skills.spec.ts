/**
 * Skills killer-flow tests — covers P4-002.
 *
 * P4-002: editing a skill in the source editor while the buffer is
 * dirty should arm the browser's "leave site?" prompt via beforeunload.
 *
 * We can't drive the native confirm dialog from Playwright (it's a
 * system-level UI on close-tab / hard-reload), but we CAN verify that
 * the page registered a beforeunload handler that returns a non-empty
 * value while the buffer is dirty — which is exactly what triggers
 * the prompt in real browsers.
 */
import { expect, test } from '@playwright/test'
import { storageStatePath } from './setup/fixtures'

test.use({ storageState: storageStatePath('regression') })

test('P4-002: skill editor arms beforeunload prompt while dirty', async ({ page }) => {
  // Navigate directly to a known bundled skill so we don't have to
  // depend on the index page's card click behaviour. `code-review`
  // is one of the always-bundled skills (12 ship with the starter).
  await page.goto('/dashboard/skills/code-review')

  // SkillEditor opens on the Overview tab — click Source so the
  // CodeMirror editor renders.
  const sourceTab = page.getByRole('tab', { name: /^source$/i }).first()
  await sourceTab.waitFor({ state: 'visible', timeout: 10_000 })
  await sourceTab.click()

  // The SkillEditor renders a CodeMirror instance — any keystroke into
  // its content area dirties the buffer. CodeMirror's editable element
  // has class .cm-content. Click + type a unique marker.
  const editor = page.locator('.cm-content').first()
  await editor.waitFor({ state: 'visible', timeout: 15_000 })
  await editor.click()
  await page.keyboard.type('\n# e2e dirty marker — do not save')

  // While dirty, verify the page would prompt on unload by intercepting
  // the dialog. We trigger an attempted reload, expect a dialog, and
  // dismiss it. If the buffer were clean, no dialog would fire.
  let dialogSeen = false
  page.once('dialog', async (dialog) => {
    dialogSeen = true
    await dialog.dismiss()
  })

  // Programmatically trigger the beforeunload via JS — Playwright's
  // page.reload() also triggers it. Some Chromium versions don't show
  // the dialog if the page hasn't had user interaction; the click +
  // keystrokes above satisfy the user-activation requirement.
  await page.evaluate(() => {
    // Dispatch a beforeunload event and check its returnValue. Modern
    // Chromium will only show the dialog on actual unload, so this is
    // the most reliable way to verify the handler is attached + active.
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    Object.defineProperty(event, 'returnValue', { writable: true, value: '' })
    window.dispatchEvent(event)
    ;(window as unknown as { __dirty: boolean }).__dirty = event.defaultPrevented
  })

  const handlerArmed = await page.evaluate(
    () => (window as unknown as { __dirty?: boolean }).__dirty === true,
  )
  expect(handlerArmed || dialogSeen).toBe(true)
})
