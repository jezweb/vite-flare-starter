/**
 * Mirror source adapter — THE file a fork swaps out.
 *
 * `listSourceRecords()` returns the full current state of the external
 * dataset. The workflow diffs nothing — it upserts every record with a
 * fresh syncedAt, so deletions in the source show up as rows whose
 * syncedAt stops advancing (prune them with `deleteStaleRecords` if your
 * source is authoritative).
 *
 * The demo source is models.flared.au/json — the same live AI-model
 * catalogue `src/shared/config/models.ts` snapshots at build time
 * (public, keyless, ~100 records: enough rows to exercise batching,
 * small enough to sync in seconds). Replace with your real API (pricing
 * feed, product catalogue, partner directory). If the caller supplies
 * the URL at runtime, gate it with `isSafePublicUrl`
 * (src/server/lib/ssrf.ts) — a hardcoded constant doesn't need it.
 */

export interface SourceRecord {
  externalId: string
  name: string
  payload: Record<string, unknown>
}

const DEMO_SOURCE_URL = 'https://models.flared.au/json'

interface FlaredModel {
  id?: string
  name?: string
  provider?: string
  source?: string
  context_length?: number
  max_output?: number
  category?: string
  tier?: string
  released?: string
  sunset_date?: string | null
  flagship?: boolean
}

export async function listSourceRecords(): Promise<SourceRecord[]> {
  const res = await fetch(DEMO_SOURCE_URL, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`mirror source responded ${res.status}`)
  }
  const body = (await res.json()) as FlaredModel[] | { models?: FlaredModel[] }
  const models = Array.isArray(body) ? body : (body.models ?? [])
  return models
    .filter((m) => m.id && m.name)
    .map((m) => ({
      externalId: m.id as string,
      name: m.name as string,
      payload: {
        provider: m.provider ?? null,
        source: m.source ?? null,
        contextLength: m.context_length ?? null,
        maxOutput: m.max_output ?? null,
        category: m.category ?? null,
        tier: m.tier ?? null,
        released: m.released ?? null,
        sunsetDate: m.sunset_date ?? null,
        flagship: m.flagship ?? false,
      },
    }))
}
