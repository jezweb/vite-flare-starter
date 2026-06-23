/**
 * SSRF guards for server-side fetch() of user-supplied URLs. Any place the
 * Worker fetches a URL the user controls must gate on these, or an attacker
 * points it at internal services / cloud metadata (169.254.169.254) / private
 * ranges and exfiltrates or pivots.
 */

/**
 * True if `raw` is an http(s) URL that does NOT target localhost, an internal
 * TLD, a private/reserved IP range, or the cloud metadata endpoint. Note: this
 * checks the literal host only (no DNS resolution — Workers can't pre-resolve),
 * so pair it with a host allowlist for the strongest guard where possible.
 */
export function isSafePublicUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    return false
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const a = Number(v4[1])
    const b = Number(v4[2])
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 || // multicast + reserved
      (a === 169 && b === 254) || // link-local + AWS/GCP metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return false
    }
  }
  // IPv6 loopback / link-local / unique-local / unspecified
  if (host === '::1' || host === '::' || host.startsWith('fe80') || host.startsWith('fc') || host.startsWith('fd')) {
    return false
  }
  return true
}

/** Hosts permitted for GitHub skill/raw fetches. */
const GITHUB_HOSTS = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'api.github.com',
])

/** True if `raw` is a safe public URL hosted on a known GitHub domain. */
export function isAllowedGitHubUrl(raw: string): boolean {
  if (!isSafePublicUrl(raw)) return false
  try {
    return GITHUB_HOSTS.has(new URL(raw).hostname.toLowerCase())
  } catch {
    return false
  }
}
