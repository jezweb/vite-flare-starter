/**
 * Sandbox id derivation — single source of truth for every getSandbox call.
 *
 * The SDK enforces DNS-shaped ids: ≤63 chars, and lowercase is required
 * for preview-URL features. Raw `user-<userId>-conv-<conversationId>`
 * (5+32+6+36 = 79 chars, mixed case from better-auth ids) fails BOTH —
 * getSandbox throws INVALID_SANDBOX_ID_LENGTH, which silently broke every
 * per-conversation sandbox tool once conversationId started flowing into
 * agent context (caught live by site_serve, 2026-07-18).
 *
 * So ids are derived, not concatenated: SHA-256 each component, keep 16
 * hex chars (64 bits — the id is a cross-user isolation boundary, so a
 * truncated cryptographic hash, never a 32-bit checksum).
 *
 *   per conversation:  sb-u<16 hex>-c<16 hex>   (38 chars)
 *   per user:          sb-u<16 hex>             (21 chars)
 *
 * Deterministic per (user, conversation), lowercase, DNS-safe. Changing
 * this scheme orphans warm sandboxes (they idle out) — harmless, but keep
 * it stable within a release.
 */

async function hash16(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest.slice(0, 8))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sandboxIdFor(userId: string, conversationId?: string | null): Promise<string> {
  const user = await hash16(`u:${userId}`)
  if (!conversationId) return `sb-u${user}`
  const conv = await hash16(`c:${conversationId}`)
  return `sb-u${user}-c${conv}`
}
