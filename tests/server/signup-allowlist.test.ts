import { describe, expect, it } from 'vitest'
import { isSignupAllowed } from '@/server/modules/auth'

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
})
