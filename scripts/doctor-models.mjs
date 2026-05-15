#!/usr/bin/env node
/**
 * doctor:models — find @cf/... Workers AI model IDs in the codebase that
 * have been removed from Cloudflare's catalogue, and suggest the current
 * flagship for the same task category.
 *
 * Workers AI ships new models weekly and retires old ones without notice.
 * env.AI.run("@cf/google/gemma-3-27b-it", ...) silently returns a 404
 * once Cloudflare drops the model — the only way to catch it is to
 * compare your code against the live catalogue.
 *
 * Source of truth: ai.flared.au (auto-synced with Cloudflare's
 * /accounts/{id}/ai/models/search API). Deprecated models are removed
 * upstream, so "absent from catalogue" = "deprecated".
 *
 * Pure read-only. Only network I/O is a single GET to the catalogue.
 *
 * Run via: `pnpm doctor:models`. Exits 1 if any deprecated IDs found.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOGUE_URL = 'https://ai.flared.au/json'

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
const dim = (s) => `    ${cl.dim}${s}${cl.reset}`

const TEXT_EXTS = new Set(['.ts', '.tsx', '.mjs', '.js', '.jsx'])
const SKIP_DIRS = new Set(['node_modules', '.wrangler', 'dist', 'build', '.git'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) walk(p, out)
    else {
      const dot = name.lastIndexOf('.')
      if (dot >= 0 && TEXT_EXTS.has(name.slice(dot))) out.push(p)
    }
  }
  return out
}

console.log(
  `${cl.bold}${cl.cyan}Models Doctor${cl.reset} — Cloudflare Workers AI deprecation check`,
)
console.log(`${cl.dim}Compares @cf/... IDs in your code against the live catalogue.${cl.reset}\n`)

// ── Step 1: collect @cf/ IDs referenced in the codebase ───────────────────
console.log(`${cl.bold}[1/3] Scanning src/ for @cf/... model IDs${cl.reset}`)
const files = walk(join(ROOT, 'src'))
const refs = new Map()
const ID_RE = /['"`](@cf\/[a-z0-9][a-z0-9-_./]+)['"`]/gi
for (const f of files) {
  let src
  try { src = readFileSync(f, 'utf8') } catch { continue }
  const rel = f.slice(ROOT.length + 1)
  let m
  while ((m = ID_RE.exec(src))) {
    const id = m[1]
    const before = src.slice(0, m.index)
    const line = before.split('\n').length
    if (!refs.has(id)) refs.set(id, new Set())
    refs.get(id).add(`${rel}:${line}`)
  }
}
console.log(pass(`Found ${refs.size} distinct @cf/ model IDs across ${files.length} files`))

// ── Step 2: fetch the live catalogue ──────────────────────────────────────
console.log(`\n${cl.bold}[2/3] Fetching live Workers AI catalogue${cl.reset}`)
console.log(dim(`Source: ${CATALOGUE_URL}`))
let catalogue = null
try {
  const r = await fetch(CATALOGUE_URL, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  catalogue = await r.json()
} catch (e) {
  // Exit 0 — catalogue unreachable is not a code defect. A developer on a
  // plane or behind a strict firewall shouldn't get a CI failure for a
  // transient network blip unrelated to their change.
  console.log(`  ${cl.yellow}⚠${cl.reset} Catalogue unreachable: ${e.message}`)
  console.log(dim('Skipping deprecation check. Referenced @cf/ IDs:'))
  for (const [id, where] of refs) {
    console.log(`  ${id}  ${cl.dim}(${where.size} ref(s))${cl.reset}`)
  }
  process.exit(0)
}

// Defensive: the upstream feed is third-party. Validate shape before
// consuming. A compromised endpoint could return arbitrary JSON.
const rawModels = catalogue?.models
if (!Array.isArray(rawModels)) {
  console.log(fail(`Catalogue response missing 'models' array — got ${typeof rawModels}`))
  console.log(dim('Endpoint may have changed shape. Skipping check.'))
  process.exit(0)
}
const models = rawModels.filter(
  (m) => m && typeof m === 'object' && typeof m.id === 'string' && m.id.startsWith('@cf/'),
)
console.log(pass(`Catalogue has ${models.length} current models (updated ${catalogue.updated ?? 'unknown'})`))

const liveIds = new Map(models.map((m) => [m.id, m]))
const flagshipsByTask = new Map()
for (const m of models) {
  if (m.flagship && typeof m.task === 'string' && !flagshipsByTask.has(m.task)) {
    flagshipsByTask.set(m.task, m.id)
  }
}

// ── Step 3: compare ────────────────────────────────────────────────────────
console.log(`\n${cl.bold}[3/3] Reconciling${cl.reset}`)
const deprecated = []
const okCount = []
for (const [id, where] of refs) {
  if (liveIds.has(id)) okCount.push(id)
  else deprecated.push({ id, where: [...where] })
}

if (okCount.length) console.log(pass(`${okCount.length} models still in catalogue`))

if (deprecated.length === 0) {
  console.log(`\n${cl.green}${cl.bold}OK — all @cf/ model IDs are current.${cl.reset}`)
  process.exit(0)
}

console.log(fail(`${deprecated.length} model(s) NOT in current catalogue (likely deprecated):`))
console.log()
for (const { id, where } of deprecated) {
  console.log(`${cl.bold}${cl.red}  ${id}${cl.reset}`)
  for (const w of where) console.log(`    ${cl.dim}${w}${cl.reset}`)
  const parts = id.split('/')
  const provider = parts[1] ?? ''
  const siblingFlagships = models.filter(
    (m) => m.flagship && m.id.startsWith(`@cf/${provider}/`),
  )
  if (siblingFlagships.length > 0) {
    console.log(`    ${cl.cyan}→ same-provider flagships:${cl.reset}`)
    for (const s of siblingFlagships) {
      console.log(`      ${cl.green}${s.id}${cl.reset} ${cl.dim}(${s.task})${cl.reset}`)
    }
  } else {
    const tg = flagshipsByTask.get('text-generation')
    if (tg) {
      console.log(`    ${cl.cyan}→ text-generation flagship:${cl.reset} ${cl.green}${tg}${cl.reset}`)
    }
  }
  console.log()
}

console.log(`${cl.dim}Fix paths above, then re-run: pnpm doctor:models${cl.reset}`)
process.exit(1)
