import { afterEach, describe, expect, it, vi } from 'vitest'
import { entities } from '@/server/modules/entities/db/schema'

// scopeUser reads a build-time flag (import.meta.env.VITE_TENANCY_MODE) at
// module load, so each mode is tested via vi.stubEnv + a fresh dynamic import.
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function loadTenancy(mode?: string) {
  if (mode === undefined) vi.stubEnv('VITE_TENANCY_MODE', '')
  else vi.stubEnv('VITE_TENANCY_MODE', mode)
  vi.resetModules()
  return import('@/server/lib/tenancy')
}

describe('tenancy scopeUser', () => {
  it('per-user mode (default): returns a userId filter condition', async () => {
    const { scopeUser, isCondition } = await loadTenancy(undefined)
    const cond = scopeUser(entities.userId, 'user-123')
    expect(cond).toBeDefined()
    expect(isCondition(cond)).toBe(true)
  })

  it('explicit per-user mode: still returns a condition', async () => {
    const { scopeUser } = await loadTenancy('per-user')
    expect(scopeUser(entities.userId, 'user-123')).toBeDefined()
  })

  it('shared mode: returns undefined (no userId filter)', async () => {
    const { scopeUser, isCondition } = await loadTenancy('shared')
    const cond = scopeUser(entities.userId, 'user-123')
    expect(cond).toBeUndefined()
    expect(isCondition(cond)).toBe(false)
  })

  it('isCondition narrows out undefined so condition arrays stay clean', async () => {
    const { scopeUser, isCondition } = await loadTenancy('shared')
    const arr = [scopeUser(entities.userId, 'u'), scopeUser(entities.userId, 'u')]
    expect(arr.filter(isCondition)).toHaveLength(0)
  })

  it('unknown value falls back to per-user (safe default)', async () => {
    const { scopeUser } = await loadTenancy('multi-galaxy')
    expect(scopeUser(entities.userId, 'user-123')).toBeDefined()
  })
})
