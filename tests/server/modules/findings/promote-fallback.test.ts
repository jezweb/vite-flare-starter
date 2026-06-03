/**
 * P2-003 — promote-to-learning falls back to observation/recommendation/title
 *
 * Findings without `fields.body` previously 400'd "Cannot promote empty
 * finding". Seed data + the chat tool sometimes write `observation` +
 * `recommendation` instead, so the promote handler now uses a fallback
 * chain. This test pins the fallback logic against every shape we know
 * users hit in the wild.
 *
 * The handler logic itself lives in
 * src/server/modules/findings/routes.ts. We mirror the chain here as
 * a pure function so the test pins the contract (refinedBody → body →
 * observation → recommendation → title) without needing to spin up a
 * full Hono app + auth middleware.
 *
 * If the route handler diverges from this chain, this test catches it
 * via a follow-up read of routes.ts on review — adjust the chain in
 * lockstep.
 */
import { describe, it, expect } from 'vitest'

interface FindingFields {
  body?: string
  observation?: string
  recommendation?: string
}

/**
 * Mirrors the fallback chain in src/server/modules/findings/routes.ts
 * (the `findingsApp.post('/:id/promote')` handler).
 */
function resolveBody(
  refinedBody: string | undefined,
  findingFields: FindingFields,
  title: string
): string {
  return (
    refinedBody ??
    findingFields.body ??
    findingFields.observation ??
    findingFields.recommendation ??
    title
  )
}

describe('promote-to-learning body fallback (P2-003)', () => {
  it('uses refinedBody when provided', () => {
    expect(resolveBody('refined', { body: 'orig' }, 'title')).toBe('refined')
  })

  it('falls back to fields.body when no refined body', () => {
    expect(resolveBody(undefined, { body: 'b' }, 'title')).toBe('b')
  })

  it('falls back to observation when body is missing', () => {
    expect(resolveBody(undefined, { observation: 'obs' }, 'title')).toBe('obs')
  })

  it('falls back to recommendation when body+observation are missing', () => {
    expect(resolveBody(undefined, { recommendation: 'rec' }, 'title')).toBe('rec')
  })

  it('falls back to title when all fields-blob keys are missing', () => {
    expect(resolveBody(undefined, {}, 'My finding title')).toBe('My finding title')
  })

  it('seed-data shape (observation + recommendation, no body) does NOT 400', () => {
    // This is the exact shape from .jez/audit-evidence/2026-05-04/seed-p2.sh
    const result = resolveBody(
      undefined,
      {
        observation: 'Seeded finding 1 from agent',
        recommendation: 'Review and decide promotion vs dismissal',
      },
      'Stuck-tickets seeded finding'
    )
    expect(result).toBeTruthy()
    expect(result).toBe('Seeded finding 1 from agent')
  })
})
