/**
 * Shared helpers for killer-flow specs.
 *
 * - storageStatePath(persona) — point a `test.use({ storageState })` at
 *   the right pre-minted state file from setup/global-setup.ts.
 * - apiContext(persona) — a Playwright APIRequestContext signed in as
 *   the persona, for seeding entities (findings, etc.) without going
 *   through the UI.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type APIRequestContext,
  type BrowserContext,
  request as playwrightRequest,
} from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_DIR = path.resolve(__dirname, '..', 'state')

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? 'https://vite-flare-starter.webfonts.workers.dev'

export type PersonaKey = 'regression' | 'power'

export function storageStatePath(persona: PersonaKey = 'regression'): string {
  return path.join(STATE_DIR, `${persona === 'power' ? 'power' : 'regression'}.json`)
}

/**
 * Spin up an API context that re-uses the storageState cookies for the
 * given persona. Useful for seeding rows directly through the app's API
 * (auth middleware accepts the better-auth session cookie).
 */
export async function apiContext(persona: PersonaKey = 'regression'): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: BASE_URL,
    storageState: storageStatePath(persona),
  })
}

/**
 * Convenience: re-use the cookies from a live BrowserContext as an
 * APIRequestContext (avoids loading the JSON file twice when a test
 * already has the page).
 */
export async function apiFromContext(ctx: BrowserContext): Promise<APIRequestContext> {
  const cookies = await ctx.cookies()
  return playwrightRequest.newContext({
    baseURL: BASE_URL,
    storageState: { cookies, origins: [] },
  })
}

export interface SeededFinding {
  id: string
  title: string
  status: string
}

/**
 * Seed a finding via the entities API. Returns the row id so the test
 * can clean up afterwards. Findings are stored as `entities` rows with
 * `type='finding'` (see findings/routes.ts).
 */
export async function seedFinding(
  api: APIRequestContext,
  overrides: Partial<{ title: string; body: string; status: string }> = {},
): Promise<SeededFinding> {
  const title = overrides.title ?? `e2e finding ${Date.now()}`
  const status = overrides.status ?? 'open'
  const body = overrides.body
  const resp = await api.post('/api/entities', {
    data: {
      type: 'finding',
      title,
      status,
      // Intentionally omit `body` for the P2-003 fallback test — the
      // caller decides whether to include it via overrides.
      fields: body !== undefined ? { body } : {},
    },
  })
  if (!resp.ok()) {
    throw new Error(`seedFinding failed: ${resp.status()} ${await resp.text()}`)
  }
  const row = (await resp.json()) as { id: string; title: string; status: string }
  return { id: row.id, title: row.title, status: row.status }
}

export async function deleteEntity(api: APIRequestContext, id: string): Promise<void> {
  // SQLite delete is forgiving — no row → no error. We swallow
  // failures silently because cleanup shouldn't fail a test.
  try {
    await api.delete(`/api/entities/${id}`)
  } catch {
    /* ignore */
  }
}

/**
 * Reopen a dismissed finding via the API. Used in spec afterEach() so
 * tests that dismiss a row can leave it in the same state they found it.
 */
export async function reopenFinding(api: APIRequestContext, id: string): Promise<void> {
  try {
    await api.post(`/api/findings/${id}/reopen`, { data: {} })
  } catch {
    /* ignore */
  }
}
