#!/usr/bin/env node
/**
 * Seed the REFERENCE_DB (read-only SQL tool demo, #77) with a flattened
 * AI-model catalogue from models.flared.au — same source the mirror
 * module syncs, but flattened into typed columns so sql_query can do
 * real analytics (GROUP BY provider, AVG(context_length), …).
 *
 * Usage:
 *   node .jez/scripts/seed-reference-db.mjs > /tmp/seed.sql
 *   npx wrangler d1 execute vite-flare-starter-reference --remote --file /tmp/seed.sql
 */
const res = await fetch('https://models.flared.au/json', {
  headers: { accept: 'application/json' },
})
if (!res.ok) throw new Error(`source responded ${res.status}`)
const body = await res.json()
const models = Array.isArray(body) ? body : (body.models ?? [])

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const n = (v) => (typeof v === 'number' ? v : 'NULL')
const b = (v) => (v === true ? 1 : v === false ? 0 : 'NULL')

const lines = [
  'DROP TABLE IF EXISTS ai_models;',
  `CREATE TABLE ai_models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT,
    source TEXT,
    context_length INTEGER,
    max_output INTEGER,
    category TEXT,
    tier TEXT,
    released TEXT,
    sunset_date TEXT,
    flagship INTEGER
  );`,
]
for (const m of models) {
  if (!m.id || !m.name) continue
  lines.push(
    `INSERT INTO ai_models (id, name, provider, source, context_length, max_output, category, tier, released, sunset_date, flagship) VALUES (` +
      [
        q(m.id),
        q(m.name),
        q(m.provider ?? null),
        q(m.source ?? null),
        n(m.context_length),
        n(m.max_output),
        q(m.category ?? null),
        q(m.tier ?? null),
        q(m.released ?? null),
        q(m.sunset_date ?? null),
        b(m.flagship),
      ].join(', ') +
      ');'
  )
}
console.log(lines.join('\n'))
console.error(`generated ${lines.length - 2} inserts`)
