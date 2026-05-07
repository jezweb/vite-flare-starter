#!/usr/bin/env node
/**
 * tool-coverage — audit chat tool rendering coverage.
 *
 * Walks every server tool definition and reports which tier each tool
 * falls into:
 *
 *   - rich:    bespoke renderer in `tool-renderers/` registry
 *   - ui:      returns `{ _ui: ... }` marker
 *   - default: at minimum has render meta in `defaults.tsx`
 *   - bare:    none of the above (drops to generic wrench + JSON)
 *
 * Note: shape renderers (`shapes.tsx`) match by output shape at runtime,
 * not by tool name — so they upgrade many "default" tools live but
 * don't appear in this static report. Actual rich coverage in the UI
 * is typically 25-30 percentage points higher than the static count.
 *
 * Run via: `pnpm tool-coverage`. Exits non-zero if any bare tools
 * exist — soft warn, not block.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TOOLS_DIR = join(ROOT, 'src/server/modules/chat/tools')
const RENDERERS_DIR = join(ROOT, 'src/client/modules/chat/components/tool-renderers')
const DEFAULTS_FILE = join(RENDERERS_DIR, 'defaults.tsx')
const UI_FILE = join(TOOLS_DIR, 'ui.ts')

function readSafe(p) {
  try { return readFileSync(p, 'utf8') } catch { return '' }
}

function collectToolNames() {
  const names = new Map()
  for (const f of readdirSync(TOOLS_DIR)) {
    if (!f.endsWith('.ts') || f === 'index.ts') continue
    const path = join(TOOLS_DIR, f)
    if (!statSync(path).isFile()) continue
    const src = readFileSync(path, 'utf8')
    const re = /\bname:\s*['"]([a-z][a-z0-9_]+)['"][^}]{0,400}description:[^}]{0,400}inputSchema:/gs
    let m
    while ((m = re.exec(src))) {
      if (!names.has(m[1])) names.set(m[1], basename(f))
    }
  }
  return names
}

function collectBespokeRendererTools() {
  const referenced = new Set()
  for (const f of readdirSync(RENDERERS_DIR)) {
    if (!f.endsWith('.tsx')) continue
    if (f === 'shapes.tsx' || f === 'defaults.tsx' || f === '_shared.tsx') continue
    const src = readFileSync(join(RENDERERS_DIR, f), 'utf8')
    for (const m of src.matchAll(/match:\s*['"]([a-z][a-z0-9_]+)['"]/g)) referenced.add(m[1])
    for (const m of src.matchAll(/match:\s*\[([^\]]+)\]/g)) {
      for (const lit of m[1].matchAll(/['"]([a-z][a-z0-9_]+)['"]/g)) referenced.add(lit[1])
    }
  }
  return referenced
}

function collectUiTools() {
  const src = readSafe(UI_FILE)
  const out = new Set()
  for (const m of src.matchAll(/['"]([a-z_]+)['"]/g)) {
    if (/^(show_|offer_|ask_|collect_|confirm_)/.test(m[1])) out.add(m[1])
  }
  return out
}

function collectDefaultTools() {
  const src = readSafe(DEFAULTS_FILE)
  const out = new Set()
  for (const m of src.matchAll(/^\s+([a-z][a-z0-9_]+):\s*\{\s*icon:/gm)) out.add(m[1])
  return out
}

const tools = collectToolNames()
const bespoke = collectBespokeRendererTools()
const ui = collectUiTools()
const defaults = collectDefaultTools()

const tiers = { rich: [], ui: [], default: [], bare: [] }
for (const [name, file] of tools) {
  if (bespoke.has(name)) tiers.rich.push({ name, file })
  else if (ui.has(name)) tiers.ui.push({ name, file })
  else if (defaults.has(name)) tiers.default.push({ name, file })
  else tiers.bare.push({ name, file })
}

const total = tools.size
const pct = (n) => total ? `${((n / total) * 100).toFixed(0)}%` : '0%'

console.log('# Tool rendering coverage')
console.log()
console.log(`Total tools discovered: ${total}`)
console.log()
console.log('| Tier | Count | % |')
console.log('|---|---|---|')
console.log(`| Rich (bespoke renderer) | ${tiers.rich.length} | ${pct(tiers.rich.length)} |`)
console.log(`| _ui marker | ${tiers.ui.length} | ${pct(tiers.ui.length)} |`)
console.log(`| Default meta only | ${tiers.default.length} | ${pct(tiers.default.length)} |`)
console.log(`| Bare wrench | ${tiers.bare.length} | ${pct(tiers.bare.length)} |`)

if (tiers.bare.length > 0) {
  console.log()
  console.log('## Bare-wrench tools — add a render block, register a renderer, or add to defaults.tsx')
  for (const { name, file } of tiers.bare) {
    console.log(`  - ${name}  (${file})`)
  }
}

const richish = tiers.rich.length + tiers.ui.length
const richPct = total ? (richish / total) * 100 : 0
const targetPct = 75

console.log()
console.log(`Static-analysis rich coverage: ${richPct.toFixed(0)}% (target ${targetPct}%+)`)
console.log()
console.log('Note: shape renderers (shapes.tsx) auto-upgrade tools at runtime')
console.log('whose output matches stdout/image/markdown/table shapes. They')
console.log('do not show up in this static report; live UI rich coverage is')
console.log('typically 25-30 percentage points higher.')

if (tiers.bare.length > 0) {
  console.error()
  console.error(`WARN: ${tiers.bare.length} bare-wrench tool${tiers.bare.length === 1 ? '' : 's'} - see list above`)
  process.exit(2)
}
