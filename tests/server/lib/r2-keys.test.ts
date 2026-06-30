/**
 * isOwnedR2Key — cross-tenant + traversal guard (security-review follow-up).
 *
 * Default per-user tenancy mode (VITE_TENANCY_MODE unset). Confirms the
 * prefix gate plus the defensive rejection of `..`/empty segments, leading
 * slashes and backslashes that images/media/files routes rely on.
 */
import { describe, expect, it } from 'vitest'
import { isOwnedR2Key } from '@/server/lib/r2-keys'

const ME = 'user-me'

describe('isOwnedR2Key (per-user mode)', () => {
  it('allows the caller’s own scoped keys', () => {
    expect(isOwnedR2Key(`users/${ME}/photo.jpg`, ME)).toBe(true)
    expect(isOwnedR2Key(`generated/${ME}/out.png`, ME)).toBe(true)
    expect(isOwnedR2Key(`files/${ME}/doc.pdf`, ME)).toBe(true)
  })

  it('denies another tenant’s keys', () => {
    expect(isOwnedR2Key('users/user-victim/photo.jpg', ME)).toBe(false)
  })

  it('denies prefix-confusion (me vs me2)', () => {
    expect(isOwnedR2Key('users/user-me2/secret.jpg', ME)).toBe(false)
  })

  it('rejects empty / nullish / unscoped keys', () => {
    expect(isOwnedR2Key('', ME)).toBe(false)
    expect(isOwnedR2Key(null, ME)).toBe(false)
    expect(isOwnedR2Key('random-key', ME)).toBe(false)
  })

  it('rejects traversal-style and malformed keys even under the right prefix', () => {
    expect(isOwnedR2Key(`users/${ME}/../user-victim/x.jpg`, ME)).toBe(false)
    expect(isOwnedR2Key(`users/${ME}/./x.jpg`, ME)).toBe(false)
    expect(isOwnedR2Key(`users/${ME}//x.jpg`, ME)).toBe(false) // empty segment
    expect(isOwnedR2Key(`/users/${ME}/x.jpg`, ME)).toBe(false) // leading slash
    expect(isOwnedR2Key(`users\\${ME}\\x.jpg`, ME)).toBe(false) // backslashes
  })
})
