#!/usr/bin/env node
/**
 * doctor:auth — diagnostic checklist for the most common
 * "OAuth completes but no session" symptoms on better-auth +
 * Cloudflare Workers.
 *
 * Checks (in order):
 *   1. wrangler.jsonc has nodejs_compat(_v2) and a D1 binding
 *   2. auth/index.ts has account.skipStateCookieCheck: true
 *   3. SignInPage uses window.location.href after auth success
 *   4. Required + recommended secrets are set on the deployed worker
 *   5. D1 auth tables exist on remote
 *   6. D1 auth tables exist locally
 *   7. Manual-verification block (values we can't read from outside —
 *      secret contents, Google Cloud Console redirect URI)
 *
 * Pure read-only. Never writes secrets, never runs migrations, never
 * deploys. Safe to run on production. Uses execFileSync (no shell
 * interpolation) so arguments derived from wrangler.jsonc can't be
 * weaponised even if the file is malformed.
 *
 * Run via: `pnpm doctor:auth`. Exits 1 if any critical check fails.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const cl = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
}
const pass = (s) => `  ${cl.green}✓${cl.reset} ${s}`
const fail = (s) => `  ${cl.red}✗${cl.reset} ${s}`
const warn = (s) => `  ${cl.yellow}⚠${cl.reset} ${s}`
const info = (s) => `  ${cl.cyan}i${cl.reset} ${s}`
const dim = (s) => `    ${cl.dim}${s}${cl.reset}`

const issues = []
const warnings = []

function header(n, total, title) {
  console.log(`\n${cl.bold}[${n}/${total}] ${title}${cl.reset}`)
}

function readSafe(p) {
  try { return readFileSync(p, 'utf8') } catch { return '' }
}

// Strip JSONC comments while respecting string literals. Handles both
// "// line" and "/* block */" forms — both common in wrangler.jsonc.
//
// Naive regex breaks because wrangler.jsonc has slash-star and
// star-slash sequences inside string values (URL globs like
// "/agents/STAR" and cron expressions like "STAR/15 STAR STAR STAR STAR").
// Walks character-by-character tracking string + comment state — the
// only safe way to handle both at once.
function parseJsonc(text) {
  let out = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]
    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false
        out += c
      }
      continue
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }
    if (escape) {
      escape = false
      out += c
      continue
    }
    if (inString) {
      if (c === '\\') escape = true
      else if (c === '"') inString = false
      out += c
      continue
    }
    // Outside string + comments
    if (c === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }
    if (c === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }
    if (c === '"') inString = true
    out += c
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

/** Run a binary with argv array — no shell interpolation. */
function runCmd(bin, args) {
  try {
    return {
      ok: true,
      stdout: execFileSync(bin, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    }
  } catch (e) {
    return {
      ok: false,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? e.message,
    }
  }
}

console.log(
  `${cl.bold}${cl.cyan}Auth Doctor${cl.reset} — better-auth on Cloudflare Workers diagnostic`,
)
console.log(`${cl.dim}Read-only checks. Run before debugging "OAuth completes, no session".${cl.reset}`)

// ── Check 1 ────────────────────────────────────────────────────────────────
header(1, 7, 'wrangler.jsonc')
const wranglerPath = join(ROOT, 'wrangler.jsonc')
let wrangler = null
if (!existsSync(wranglerPath)) {
  console.log(fail('wrangler.jsonc not found at project root'))
  issues.push('wrangler.jsonc missing')
} else {
  try {
    wrangler = parseJsonc(readSafe(wranglerPath))
    const flags = wrangler.compatibility_flags ?? []
    const nodeFlag = flags.find((f) => f === 'nodejs_compat' || f === 'nodejs_compat_v2')
    if (nodeFlag) {
      console.log(pass(`compatibility_flags includes ${nodeFlag}`))
    } else {
      console.log(fail('compatibility_flags missing nodejs_compat or nodejs_compat_v2'))
      console.log(dim('better-auth uses AsyncLocalStorage — signed cookies fail without this'))
      issues.push('nodejs_compat flag missing')
    }
    if (wrangler.compatibility_date) {
      console.log(pass(`compatibility_date: ${wrangler.compatibility_date}`))
    } else {
      console.log(warn('compatibility_date not set'))
    }
    const d1 = wrangler.d1_databases?.[0]
    if (d1?.database_name) {
      console.log(pass(`D1 binding: ${d1.binding} → ${d1.database_name}`))
    } else {
      console.log(fail('No D1 binding configured in wrangler.jsonc'))
      issues.push('D1 binding missing')
    }
  } catch (e) {
    console.log(fail(`wrangler.jsonc parse error: ${e.message}`))
    issues.push('wrangler.jsonc unparseable')
  }
}

// ── Check 2 ────────────────────────────────────────────────────────────────
header(2, 7, 'Server auth code patterns')
const authPath = join(ROOT, 'src/server/modules/auth/index.ts')
const authSrc = readSafe(authPath)
if (!authSrc) {
  console.log(fail(`Cannot find ${authPath}`))
  issues.push('auth/index.ts missing')
} else {
  if (/skipStateCookieCheck:\s*true/.test(authSrc)) {
    console.log(pass('skipStateCookieCheck: true is set'))
  } else {
    console.log(fail('account.skipStateCookieCheck: true NOT set'))
    console.log(dim('OAuth state cookie does not survive Google\'s cross-site redirect on Workers'))
    console.log(dim('Fix: betterAuth({ account: { skipStateCookieCheck: true } })'))
    issues.push('skipStateCookieCheck missing')
  }
  if (/socialProviders[\s\S]{0,300}google\s*:/.test(authSrc)) {
    console.log(pass('Google social provider configured in code'))
  } else {
    console.log(warn('Google social provider not found in auth/index.ts'))
  }
  if (/ipAddressHeaders[\s\S]{0,100}cf-connecting-ip/.test(authSrc)) {
    console.log(pass('cf-connecting-ip configured for session IP capture'))
  } else {
    console.log(warn('cf-connecting-ip not in ipAddressHeaders — sessions UI will show "Unknown IP"'))
  }
}

// ── Check 3 ────────────────────────────────────────────────────────────────
header(3, 7, 'Client SPA login race-condition fix')
const signInPath = join(ROOT, 'src/client/modules/auth/SignInPage.tsx')
const signInSrc = readSafe(signInPath)
if (!signInSrc) {
  console.log(warn(`Cannot find SignInPage at ${signInPath} (renamed?)`))
} else {
  const hasWindowLocation = /window\.location\.href\s*=/.test(signInSrc)
  const hasNavigate = /\bnavigate\s*\(/.test(signInSrc)
  if (hasWindowLocation) {
    console.log(pass('SignInPage uses window.location.href after auth (cookies re-read)'))
  } else if (hasNavigate) {
    console.log(fail('SignInPage uses navigate() — useSession() will return null after sign-in'))
    console.log(dim('Fix: replace navigate("/") with window.location.href = "/" after signIn'))
    issues.push('SignInPage SPA race condition')
  } else {
    console.log(warn('Could not detect post-signin navigation pattern — check manually'))
  }
}

// ── Check 4 ────────────────────────────────────────────────────────────────
header(4, 7, 'Deployed secrets')
const secretList = runCmd('npx', ['wrangler', 'secret', 'list'])
if (!secretList.ok) {
  console.log(warn('Could not list secrets — wrangler not authenticated, or worker not deployed yet'))
  console.log(dim('Run: npx wrangler login    (and: pnpm deploy if not yet deployed)'))
  warnings.push('Could not check secrets')
} else {
  let names = []
  try {
    names = JSON.parse(secretList.stdout).map((s) => s.name)
  } catch {
    names = secretList.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.includes('Name') && !l.includes('---'))
  }
  const required = ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL']
  const recommended = ['TRUSTED_ORIGINS']
  for (const s of required) {
    if (names.includes(s)) console.log(pass(`${s} set`))
    else {
      console.log(fail(`${s} NOT set`))
      console.log(dim(`Fix: printf "<value>" | npx wrangler secret put ${s}`))
      issues.push(`${s} missing`)
    }
  }
  for (const s of recommended) {
    if (names.includes(s)) console.log(pass(`${s} set`))
    else {
      console.log(warn(`${s} not set — recommended for CORS / cookie domains`))
      warnings.push(`${s} unset`)
    }
  }
  const googleId = names.includes('GOOGLE_CLIENT_ID')
  const googleSecret = names.includes('GOOGLE_CLIENT_SECRET')
  if (googleId && googleSecret) {
    console.log(pass('Google OAuth credentials present (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET)'))
  } else if (googleId || googleSecret) {
    console.log(fail('Only one of GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET is set — Google OAuth will fail'))
    issues.push('Partial Google OAuth credentials')
  } else {
    console.log(dim('(Google OAuth credentials not set — Google sign-in disabled)'))
  }
}

// ── Check 5 + 6 ─────────────────────────────────────────────────────────────
const dbName = wrangler?.d1_databases?.[0]?.database_name
const REQUIRED_TABLES = ['user', 'session', 'account', 'verification']
const TABLE_QUERY =
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user','session','account','verification')"
// Cloudflare's D1 naming rules — letters, digits, hyphens, underscores.
// Defensive guard: a malicious wrangler.jsonc could put `--remote` or
// other flag-like values here. execFileSync prevents shell injection
// but not wrangler-argument confusion. Cheap regex check closes the gap.
const D1_NAME_RE = /^[a-zA-Z0-9_-]+$/

function checkD1Tables(scopeFlag, label) {
  if (!dbName) {
    console.log(warn(`No D1 database name found — skipping ${label} check`))
    return
  }
  if (!D1_NAME_RE.test(dbName)) {
    console.log(warn(`Skipping ${label} check — D1 database_name has unexpected characters: ${dbName}`))
    return
  }
  const r = runCmd('npx', [
    'wrangler',
    'd1',
    'execute',
    dbName,
    scopeFlag,
    '--command',
    TABLE_QUERY,
    '--json',
  ])
  if (!r.ok) {
    console.log(warn(`Could not query ${label} D1`))
    console.log(dim(`If first deploy: pnpm db:migrate:${scopeFlag === '--remote' ? 'remote' : 'local'}`))
    if (scopeFlag === '--remote') warnings.push('Could not check remote D1')
    return
  }
  let tables = []
  try {
    const j = JSON.parse(r.stdout)
    tables = (j[0]?.results ?? []).map((row) => row.name)
  } catch {
    /* leave tables empty */
  }
  const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t))
  if (missing.length === 0) {
    console.log(pass(`All auth tables exist on ${label}: ${REQUIRED_TABLES.join(', ')}`))
  } else if (scopeFlag === '--remote') {
    console.log(fail(`Missing auth tables on ${label}: ${missing.join(', ')}`))
    console.log(dim('Run: pnpm db:migrate:remote'))
    issues.push(`Remote D1 missing tables: ${missing.join(', ')}`)
  } else {
    console.log(warn(`Missing local: ${missing.join(', ')}`))
    console.log(dim('Run: pnpm db:migrate:local'))
  }
}

header(5, 7, 'D1 auth tables (remote)')
checkD1Tables('--remote', 'remote')

header(6, 7, 'D1 auth tables (local)')
checkD1Tables('--local', 'local')

// ── Check 7 ────────────────────────────────────────────────────────────────
header(7, 7, 'Manual verification (we can\'t read secret values from outside)')
const workerName = wrangler?.name ?? '<worker-name>'
const customDomain = (wrangler?.routes ?? []).find((r) => r.custom_domain)?.pattern
const expectedUrl = customDomain
  ? `https://${customDomain}`
  : `https://${workerName}.<your-subdomain>.workers.dev`

console.log(info(`Verify ${cl.bold}BETTER_AUTH_URL${cl.reset} equals exactly:`))
console.log(dim(expectedUrl))
console.log()
console.log(info(`Verify ${cl.bold}Google Cloud Console${cl.reset} redirect URI includes:`))
console.log(dim(`${expectedUrl}/api/auth/callback/google`))
console.log()
console.log(info(`Verify ${cl.bold}TRUSTED_ORIGINS${cl.reset} includes both:`))
console.log(dim(`http://localhost:5173,${expectedUrl}`))
console.log()
console.log(info(`Secrets must be set with ${cl.bold}printf${cl.reset}, never ${cl.bold}echo${cl.reset} (echo adds \\n):`))
console.log(dim('printf "<value>" | npx wrangler secret put BETTER_AUTH_URL'))

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${cl.bold}─────────────────────────────────────────${cl.reset}`)
if (issues.length === 0) {
  console.log(`${cl.green}${cl.bold}OK — no critical issues found.${cl.reset}`)
  if (warnings.length > 0) {
    console.log(`${cl.yellow}${warnings.length} warning(s) above.${cl.reset}`)
  }
  console.log(
    `${cl.dim}Still seeing "OAuth completes but no session"? Re-read [7/7] carefully — that's where ~95% of fresh-fork issues live.${cl.reset}`,
  )
  process.exit(0)
} else {
  console.log(`${cl.red}${cl.bold}${issues.length} critical issue(s) found:${cl.reset}`)
  for (const i of issues) console.log(`  • ${i}`)
  console.log(`\n${cl.dim}Fix the issues above, then re-run: pnpm doctor:auth${cl.reset}`)
  process.exit(1)
}
