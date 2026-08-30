/**
 * Every hand-written model id must exist in the bundled catalogue snapshot.
 *
 * The snapshot (`src/shared/data/models-snapshot.json`) refreshes monthly
 * from flared.au and is the ground truth for which ids OpenRouter / Workers
 * AI will actually accept. The curated lists and aliases are plain strings,
 * so a retired id passes type-check and build and only fails at runtime,
 * on the first real call that picks it. Twice now a catalogue refresh has
 * landed while `src/` kept referencing removed ids (6 in 2026-07, 2 more in
 * 2026-08 — see `.jez/artifacts/model-catalogue-refresh-2026-08-25.md`).
 * This pins the invariant so the same refresh that retires an id fails CI.
 *
 * If this test fails after `pnpm models:refresh`: the named id was removed
 * from the catalogue — pick its successor in `src/shared/config/models.ts`
 * / `ALIAS_TO_MODEL_ID`, don't delete the assertion.
 */
import { describe, expect, it } from 'vitest'
import { ALIAS_TO_MODEL_ID } from '@/server/lib/ai/models'
import { DEFAULT_MODEL_ID, ENABLED_MODEL_IDS } from '@/shared/config/models'
import snapshot from '@/shared/data/models-snapshot.json'

const catalogueIds = new Set((snapshot as { models: { id: string }[] }).models.map((m) => m.id))

describe('model ids vs catalogue snapshot', () => {
  it('every enabled model id exists in the snapshot', () => {
    const dead = ENABLED_MODEL_IDS.filter((id) => !catalogueIds.has(id))
    expect(dead, `retired ids still enabled in src/shared/config/models.ts: ${dead.join(', ')}`).toEqual([])
  })

  it('every alias points at a snapshot model', () => {
    const dead = Object.entries(ALIAS_TO_MODEL_ID).filter(([, id]) => !catalogueIds.has(id))
    expect(
      dead.map(([alias, id]) => `${alias} → ${id}`),
      'aliases in ALIAS_TO_MODEL_ID point at ids missing from the catalogue',
    ).toEqual([])
  })

  it('the default model exists in the snapshot', () => {
    expect(catalogueIds.has(DEFAULT_MODEL_ID)).toBe(true)
  })
})
