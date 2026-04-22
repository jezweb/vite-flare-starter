/**
 * AES-GCM token encryption — used for MCP connector OAuth tokens at rest.
 *
 * Key derived from the `TOKEN_ENCRYPTION_KEY` env var (arbitrary string).
 * We SHA-256 it to get 32 bytes, then import as an AES-GCM key. This keeps
 * the secret easy to rotate (change the env var, re-connect) and avoids
 * anyone having to paste raw binary.
 *
 * Output format (base64url, URL-safe):
 *   <iv_12bytes>.<ciphertext>
 *
 * If `TOKEN_ENCRYPTION_KEY` is absent we throw loudly — encrypted fields
 * must never be silently persisted in plaintext.
 */

const IV_LENGTH = 12 // AES-GCM standard

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function getKey(envSecret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(envSecret),
  )
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encrypt(plaintext: string, envSecret: string | undefined): Promise<string> {
  if (!envSecret) {
    throw new Error('TOKEN_ENCRYPTION_KEY not set — cannot encrypt MCP credentials')
  }
  const key = await getKey(envSecret)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ctBuf))}`
}

export async function decrypt(
  ciphertext: string | null | undefined,
  envSecret: string | undefined,
): Promise<string | null> {
  if (!ciphertext) return null
  if (!envSecret) {
    throw new Error('TOKEN_ENCRYPTION_KEY not set — cannot decrypt MCP credentials')
  }
  const [ivPart, ctPart] = ciphertext.split('.')
  if (!ivPart || !ctPart) throw new Error('Invalid ciphertext format')
  const iv = fromBase64Url(ivPart)
  const ct = fromBase64Url(ctPart)
  const key = await getKey(envSecret)
  const ptBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ct as unknown as BufferSource,
  )
  return new TextDecoder().decode(ptBuf)
}

/** PKCE verifier + challenge pair (SHA-256). */
export async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const verifier = toBase64Url(bytes)
  const challengeBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = toBase64Url(new Uint8Array(challengeBuf))
  return { verifier, challenge }
}

/** Cryptographically strong random state/nonce string. */
export function randomToken(lengthBytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(lengthBytes)))
}
