#!/usr/bin/env tsx
/**
 * Refresh the bundled model catalogue from https://models.flared.au/json.
 *
 * Run: `pnpm models:refresh`
 *
 * flared.au stays current with the OpenRouter catalogue automatically.
 * Re-run whenever you want to pick up newly released models. Commit the
 * updated JSON so your deploys stay deterministic.
 */
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT = join(__dirname, '../src/shared/data/models-snapshot.json')
const SOURCE = 'https://models.flared.au/json'

async function main() {
  console.log(`Fetching ${SOURCE}...`)
  const resp = await fetch(SOURCE)
  if (!resp.ok) {
    console.error(`Failed: HTTP ${resp.status}`)
    process.exit(1)
  }
  const data = (await resp.json()) as { total: number; updated: string; models: unknown[] }
  writeFileSync(OUTPUT, JSON.stringify(data, null, 2) + '\n')
  console.log(`  Saved ${data.total} models → ${OUTPUT}`)
  console.log(`  Snapshot updated: ${data.updated}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
