#!/usr/bin/env node
/**
 * test-session — mint a headless test session as Playwright storageState (#116).
 *
 * Wraps POST /api/test-auth/cookies and normalises the better-auth cookie
 * array into the exact storageState shape Playwright wants (domain fallback,
 * sameSite casing, `__Secure-`/`__Host-` prefixes forcing secure: true),
 * so agents stop hand-shaping cookies per run.
 *
 *   node scripts/test-session.mjs \
 *     --url https://app.example.com \
 *     --email alice@test.example.local > state.json
 *
 *   # storageState JSON → stdout (pipeable / --out file)
 *   # curl "Cookie:" header line + user summary → stderr
 *
 * Then:
 *   playwright-cli open --config='{"contextOptions":{"storageState":"state.json"}}'
 *   # or in a script: browser.newContext({ storageState: 'state.json' })
 *   # or: curl -H "$(node scripts/test-session.mjs ... 2>&1 >/dev/null | grep '^Cookie:')" $URL/api/...
 *
 * Auth: TEST_AUTH_TOKEN env var or --token. The deployed worker must have
 * the same secret set (see test-auth module docstring).
 *
 * ⚠️  Cleanup ordering (#116): /api/test-auth/cleanup deletes the user
 * behind this session too. Run cleanup LAST, or pass ?keep=<email> to
 * spare sessions you're still driving.
 */
import { writeFileSync } from 'node:fs'
import process from 'node:process'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq !== -1) args[a.slice(2, eq)] = a.slice(eq + 1)
    else args[a.slice(2)] = argv[i + 1]?.startsWith('--') ? 'true' : (argv[++i] ?? 'true')
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const url = args.url
const email = args.email
const token = args.token ?? process.env.TEST_AUTH_TOKEN

function die(msg) {
  console.error(`test-session: ${msg}`)
  console.error(
    'usage: node scripts/test-session.mjs --url https://app.example.com ' +
      '--email alice@test.example.local [--name Alice] [--out state.json] [--token ...]'
  )
  process.exit(1)
}

if (!url) die('--url is required (deployed app origin)')
if (!email) die('--email is required (must match *@test.<anything>.local)')
if (!token) die('no token — set TEST_AUTH_TOKEN or pass --token')

const origin = new URL(url).origin

const res = await fetch(`${origin}/api/test-auth/cookies`, {
  method: 'POST',
  headers: { 'X-Test-Auth': token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, ...(args.name ? { name: args.name } : {}) }),
})

if (!res.ok) {
  const body = await res.text()
  if (res.status === 404)
    die('endpoint returned 404 — TEST_AUTH_TOKEN is not set on the deployed worker')
  die(`HTTP ${res.status}: ${body.slice(0, 300)}`)
}

const { user, cookies } = await res.json()
if (!Array.isArray(cookies) || cookies.length === 0) die('no cookies in response')

const SAMESITE = { lax: 'Lax', strict: 'Strict', none: 'None' }
const hostname = new URL(origin).hostname

const storageState = {
  cookies: cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain || hostname,
    path: c.path || '/',
    expires: typeof c.expires === 'number' ? c.expires : -1,
    httpOnly: c.httpOnly ?? true,
    // __Secure-/__Host- prefixed cookies are rejected by the browser
    // unless secure — force it regardless of what the API reported.
    secure: Boolean(c.secure) || c.name.startsWith('__Secure-') || c.name.startsWith('__Host-'),
    sameSite: SAMESITE[String(c.sameSite ?? 'lax').toLowerCase()] ?? 'Lax',
  })),
  origins: [],
}

const json = JSON.stringify(storageState, null, 2)
if (args.out) {
  writeFileSync(args.out, json)
  console.error(`test-session: wrote ${args.out}`)
} else {
  process.stdout.write(json + '\n')
}

const cookieHeader = storageState.cookies.map((c) => `${c.name}=${c.value}`).join('; ')
console.error(`user: ${user.email} (${user.id})`)
console.error(`Cookie: ${cookieHeader}`)
console.error(
  'reminder: run /api/test-auth/cleanup LAST (or with ?keep=' + email + ') — it deletes this user.'
)
