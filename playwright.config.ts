/**
 * Playwright config for killer-flow regression tests.
 *
 * - Targets the live deployment by default; override with PLAYWRIGHT_BASE_URL
 *   to point at a local `pnpm dev` (port 5173) or a preview wrangler.
 * - Storage state files (`tests/e2e/state/<persona>.json`) are produced by
 *   the global setup and consumed by individual specs to skip auth.
 * - Single chromium project — we don't need multi-browser coverage for
 *   these regression checks; the bugs they catch are app-level.
 */
import { defineConfig, devices } from '@playwright/test'

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? 'https://vite-flare-starter.webfonts.workers.dev'

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/setup/**', '**/state/**'],
  globalSetup: './tests/e2e/setup/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
})
