/**
 * Webhook signature verification helpers
 *
 * Webhook senders (Slack, GitHub, Stripe, custom) prove they're
 * legitimate by signing the request body with a shared secret. The
 * receiver recomputes the signature and rejects mismatches.
 *
 * Two common patterns covered here:
 *
 *   1. **HMAC SHA-256** (most senders): signature is `sha256=<hex>`
 *      where hex is HMAC-SHA256(body, secret). Constant-time compare.
 *      Used by GitHub, Slack, Stripe, Shopify, most enterprise SaaS.
 *
 *   2. **Plain shared secret** (simple custom integrations): the
 *      sender includes the secret verbatim in a header. Easier to set
 *      up, weaker security (replays + MITM possible without TLS).
 *
 * Use HMAC by default. Plain shared secret is acceptable for closed
 * internal integrations behind TLS where rotation is easy.
 */

/**
 * Convert an ArrayBuffer to lower-case hex. Web crypto returns
 * raw bytes; HMAC headers are conventionally hex-encoded.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Constant-time string comparison. Naive `a === b` short-circuits on
 * the first mismatched character — leaks length/position information
 * via timing. Use this for any signature / token comparison.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * Verify a webhook's HMAC SHA-256 signature header against the body.
 *
 * Standard pattern — works with GitHub, Slack, Stripe, Shopify, most
 * enterprise SaaS that ship signed webhooks.
 *
 * @param secret   Shared secret configured with the sender.
 * @param body     Raw request body (string). MUST be the exact bytes
 *                 the sender signed — not parsed JSON, not normalised.
 * @param signature  Header value, with or without `sha256=` prefix.
 *                   Lower-case hex digest of HMAC-SHA256(body, secret).
 */
export async function verifyHmacSha256(
  secret: string,
  body: string,
  signature: string,
): Promise<boolean> {
  if (!secret || !signature) return false
  // Strip the `sha256=` prefix if present — GitHub and friends
  // include it; some senders don't.
  const expected = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return constantTimeEqual(bufferToHex(signed), expected.toLowerCase())
}

/**
 * Verify a plain shared-secret header (just a constant-time string
 * compare). Use only for closed integrations behind TLS; HMAC is the
 * better default.
 */
export function verifySharedSecret(expected: string, provided: string): boolean {
  if (!expected || !provided) return false
  return constantTimeEqual(expected, provided)
}

/**
 * Generate a random webhook secret. 32 bytes hex = 256 bits of entropy,
 * enough for HMAC keys and shared secrets. Use this on agent creation
 * + when rotating.
 */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
