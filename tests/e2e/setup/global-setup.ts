/**
 * Global setup — runs once before any spec.
 *
 * Mints real signed-in sessions for two test personas via the
 * /api/test-auth/cookies endpoint (gated by TEST_AUTH_TOKEN), saves the
 * resulting Playwright storageState to disk, and lets every spec
 * `test.use({ storageState: ... })` to start authenticated.
 *
 * Personas:
 *   - regression@test.audit.local        — most flows
 *   - regression-power@test.audit.local  — power-user / heavier surfaces
 *
 * Reads TEST_AUTH_TOKEN from process.env. We don't read .dev.vars here
 * (those are wrangler-local secrets, not always synced) — set the env
 * var in your shell or CI config. The shared overnight value lives in
 * the regression brief.
 */
import { request as playwrightRequest } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_DIR = path.resolve(__dirname, '..', 'state')

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? 'https://vite-flare-starter.webfonts.workers.dev'

export interface Persona {
  key: 'regression' | 'power'
  email: string
  name: string
  storageStateFile: string
}

export const PERSONAS: Persona[] = [
  {
    key: 'regression',
    email: 'regression@test.audit.local',
    name: 'Regression',
    storageStateFile: path.join(STATE_DIR, 'regression.json'),
  },
  {
    key: 'power',
    email: 'regression-power@test.audit.local',
    name: 'Regression Power',
    storageStateFile: path.join(STATE_DIR, 'power.json'),
  },
]

interface MintedCookie {
  name: string
  value: string
  domain: string
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  expires?: number
}

interface MintResponse {
  user: { id: string; email: string; name: string | null; role: string }
  cookies: MintedCookie[]
}

async function mintPersona(token: string, persona: Persona): Promise<MintResponse> {
  const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL })
  try {
    const resp = await ctx.post('/api/test-auth/cookies', {
      headers: {
        'X-Test-Auth': token,
        'Content-Type': 'application/json',
      },
      data: { email: persona.email, name: persona.name },
    })
    if (!resp.ok()) {
      const body = await resp.text()
      throw new Error(
        `test-auth/cookies failed for ${persona.email}: ${resp.status()} ${body}`,
      )
    }
    return (await resp.json()) as MintResponse
  } finally {
    await ctx.dispose()
  }
}

function toPlaywrightStorageState(baseUrl: string, cookies: MintedCookie[]) {
  const url = new URL(baseUrl)
  return {
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain || url.hostname,
      path: c.path || '/',
      httpOnly: c.httpOnly ?? true,
      secure: c.secure ?? true,
      sameSite: (c.sameSite ?? 'Lax') as 'Strict' | 'Lax' | 'None',
      // Playwright wants seconds-since-epoch or -1; default to a year
      // out so cookies persist long enough for full suite + retries.
      expires: c.expires ?? Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    })),
    origins: [],
  }
}

async function globalSetup() {
  const token = process.env.TEST_AUTH_TOKEN
  if (!token) {
    throw new Error(
      'TEST_AUTH_TOKEN is required. Export it in your shell before running ' +
        'pnpm test:e2e. The shared overnight token is documented in the ' +
        'regression test brief.',
    )
  }

  await fs.mkdir(STATE_DIR, { recursive: true })

  // Mint sequentially so a failure on persona[0] doesn't fire two
  // simultaneous error logs that mask the first.
  for (const persona of PERSONAS) {
    const minted = await mintPersona(token, persona)
    const state = toPlaywrightStorageState(BASE_URL, minted.cookies)
    await fs.writeFile(persona.storageStateFile, JSON.stringify(state, null, 2))
    // eslint-disable-next-line no-console
    console.log(
      `[playwright global-setup] minted ${persona.email} -> ${path.basename(
        persona.storageStateFile,
      )}`,
    )
  }
}

export default globalSetup
