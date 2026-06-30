import { describe, expect, it } from 'vitest'
import { isSignupAllowed, isAllowlistActive } from '@/server/modules/auth'

describe('signup allowlist gate (#88)', () => {
  it('is inactive by default → allows everyone (public-starter default)', () => {
    expect(isSignupAllowed('anyone@anywhere.com', {})).toBe(true)
    expect(
      isSignupAllowed('anyone@anywhere.com', { ALLOWED_AUTH_EMAILS: '', ALLOWED_AUTH_DOMAINS: '' })
    ).toBe(true)
  })

  it('domain allowlist: matches by domain, blocks others', () => {
    const cfg = { ALLOWED_AUTH_DOMAINS: 'acme.com,jezweb.net' }
    expect(isSignupAllowed('alice@acme.com', cfg)).toBe(true)
    expect(isSignupAllowed('bob@jezweb.net', cfg)).toBe(true)
    expect(isSignupAllowed('eve@evil.com', cfg)).toBe(false)
  })

  it('email allowlist: matches exact addresses only', () => {
    const cfg = { ALLOWED_AUTH_EMAILS: 'alice@acme.com' }
    expect(isSignupAllowed('alice@acme.com', cfg)).toBe(true)
    expect(isSignupAllowed('bob@acme.com', cfg)).toBe(false)
  })

  it('is case-insensitive and tolerates a leading @ on domains', () => {
    expect(isSignupAllowed('Alice@ACME.com', { ALLOWED_AUTH_DOMAINS: '@Acme.com' })).toBe(true)
    expect(isSignupAllowed('BOB@Jezweb.NET', { ALLOWED_AUTH_EMAILS: 'bob@jezweb.net' })).toBe(true)
  })

  it('AUTH_ALLOWLIST=true with empty lists fails closed (rejects all)', () => {
    expect(isSignupAllowed('anyone@anywhere.com', { AUTH_ALLOWLIST: 'true' })).toBe(false)
  })

  it('blocks an email with no domain when the gate is active', () => {
    expect(isSignupAllowed('garbage', { ALLOWED_AUTH_DOMAINS: 'acme.com' })).toBe(false)
  })

  describe('test-domain bypass (#91)', () => {
    it('allows *@test.<x>.local when TEST_AUTH_TOKEN is set, even behind an active allowlist', () => {
      const cfg = { ALLOWED_AUTH_DOMAINS: 'acme.com', TEST_AUTH_TOKEN: 'secret' }
      expect(isSignupAllowed('alice@test.vite-flare.local', cfg)).toBe(true)
      // Real domains still gated as normal.
      expect(isSignupAllowed('eve@evil.com', cfg)).toBe(false)
    })

    it('bypasses even AUTH_ALLOWLIST=true fail-closed mode', () => {
      expect(
        isSignupAllowed('bot@test.anything.local', { AUTH_ALLOWLIST: 'true', TEST_AUTH_TOKEN: 'x' })
      ).toBe(true)
    })

    it('does NOT bypass without TEST_AUTH_TOKEN (no token → no widening)', () => {
      expect(
        isSignupAllowed('alice@test.vite-flare.local', { ALLOWED_AUTH_DOMAINS: 'acme.com' })
      ).toBe(false)
    })

    it('only bypasses the strict test pattern, not lookalikes', () => {
      const cfg = { ALLOWED_AUTH_DOMAINS: 'acme.com', TEST_AUTH_TOKEN: 'secret' }
      expect(isSignupAllowed('alice@test.acme.com', cfg)).toBe(false) // not .local
      expect(isSignupAllowed('alice@nottest.foo.local', cfg)).toBe(false) // not test.*
    })
  })

  // Drives the login-gate fail-open-vs-closed decision (session.create.before).
  describe('isAllowlistActive (login-gate fail mode)', () => {
    it('is false when no allowlist is configured → error paths fail OPEN', () => {
      expect(isAllowlistActive({})).toBe(false)
      expect(isAllowlistActive({ ALLOWED_AUTH_EMAILS: '', ALLOWED_AUTH_DOMAINS: '  ' })).toBe(false)
    })
    it('is true when any allowlist mechanism is set → error paths fail CLOSED', () => {
      expect(isAllowlistActive({ ALLOWED_AUTH_EMAILS: 'a@b.com' })).toBe(true)
      expect(isAllowlistActive({ ALLOWED_AUTH_DOMAINS: 'acme.com' })).toBe(true)
      expect(isAllowlistActive({ AUTH_ALLOWLIST: 'true' })).toBe(true)
    })
  })
})
