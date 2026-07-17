/**
 * Domain-scoped search helpers (#89).
 *
 * The provider calls are network-side; what must be pinned here is the
 * allow-list machinery: env parsing, hostname matching (including the
 * evil-example.com suffix bypass), and fail-closed behaviour on garbage.
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeDomain,
  parseTrustedDomains,
  urlMatchesDomains,
} from '@/server/modules/chat/tools/search'

describe('normalizeDomain', () => {
  it('accepts bare hostnames and lowercases', () => {
    expect(normalizeDomain('Docs.Example.COM')).toBe('docs.example.com')
  })

  it('strips scheme, path, port, wildcard prefix', () => {
    expect(normalizeDomain('https://example.com/path?q=1')).toBe('example.com')
    expect(normalizeDomain('*.example.com')).toBe('example.com')
    expect(normalizeDomain('example.com:8443')).toBe('example.com')
  })

  it('rejects entries that are not hostnames', () => {
    expect(normalizeDomain('')).toBeNull()
    expect(normalizeDomain('not a domain')).toBeNull()
    expect(normalizeDomain('localhost')).toBeNull() // single label — no TLD
    expect(normalizeDomain('-bad.example.com')).toBeNull()
  })
})

describe('parseTrustedDomains', () => {
  it('splits on commas and whitespace, dedupes', () => {
    expect(
      parseTrustedDomains('ato.gov.au, docs.example.com  https://ato.gov.au/tax')
    ).toEqual(['ato.gov.au', 'docs.example.com'])
  })

  it('empty / undefined → empty list', () => {
    expect(parseTrustedDomains(undefined)).toEqual([])
    expect(parseTrustedDomains('  ,  ')).toEqual([])
  })
})

describe('urlMatchesDomains', () => {
  const domains = ['example.com', 'ato.gov.au']

  it('matches the domain itself and subdomains', () => {
    expect(urlMatchesDomains('https://example.com/page', domains)).toBe(true)
    expect(urlMatchesDomains('https://docs.example.com/api', domains)).toBe(true)
    expect(urlMatchesDomains('https://www.ato.gov.au/', domains)).toBe(true)
  })

  it('does NOT match suffix-lookalike hosts (evil-example.com)', () => {
    expect(urlMatchesDomains('https://evil-example.com/', domains)).toBe(false)
    expect(urlMatchesDomains('https://example.com.evil.net/', domains)).toBe(false)
  })

  it('is case-insensitive on the host', () => {
    expect(urlMatchesDomains('https://EXAMPLE.com/x', domains)).toBe(true)
  })

  it('fails closed on unparseable URLs', () => {
    expect(urlMatchesDomains('not-a-url', domains)).toBe(false)
    expect(urlMatchesDomains('', domains)).toBe(false)
  })
})
