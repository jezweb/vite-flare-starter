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
const OPENROUTER_SOURCE = 'https://models.flared.au/json'
const WORKERS_AI_SOURCE = 'https://ai.flared.au/json'

interface CatalogueResponse {
  updated: string
  total: number
  models: Record<string, unknown>[]
}

async function fetchCatalogue(url: string): Promise<CatalogueResponse> {
  console.log(`  Fetching ${url}...`)
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`${url} → HTTP ${resp.status}`)
  return (await resp.json()) as CatalogueResponse
}

async function main() {
  const [openrouter, workersai] = await Promise.all([
    fetchCatalogue(OPENROUTER_SOURCE),
    fetchCatalogue(WORKERS_AI_SOURCE),
  ])

  // Tag each model with its source so the server knows how to route it.
  const tagged = [
    ...openrouter.models.map((m) => ({ ...m, source: 'openrouter' })),
    ...workersai.models
      .filter((m) => m.task === 'text-generation') // skip speech/image/embedding for now
      .map((m) => ({ ...m, source: 'workers-ai' })),
  ]

  const data = {
    updated: new Date().toISOString(),
    total: tagged.length,
    sources: {
      openrouter: { url: OPENROUTER_SOURCE, updated: openrouter.updated, count: openrouter.models.length },
      workersai: { url: WORKERS_AI_SOURCE, updated: workersai.updated, count: workersai.models.length },
    },
    models: tagged,
  }

  writeFileSync(OUTPUT, JSON.stringify(data, null, 2) + '\n')
  console.log(`\n  Saved ${data.total} models → ${OUTPUT}`)
  console.log(`    ${openrouter.models.length} OpenRouter + ${data.total - openrouter.models.length} Workers AI`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
