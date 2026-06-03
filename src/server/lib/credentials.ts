/**
 * Credential resolution — BYOK with env fallback
 *
 * Single entry point for every "do we have a key for X" lookup. Order:
 *
 *   1. User's active credential for the provider (most specific)
 *   2. Org credential for the user's active org (shared workspace key)
 *   3. Env var (operator-supplied default — backwards-compatible path)
 *   4. null (caller decides what to do — usually error or skip the tool)
 *
 * Wired into:
 *   - `src/server/lib/ai/providers.ts` — AI provider keys (replaces
 *     direct env reads)
 *   - `src/server/modules/chat/tools/search.ts` — search engine keys
 *   - `src/server/modules/chat/tools/firecrawl.ts` — Firecrawl key
 *
 * Why "credentials" not "secrets": these are USER-supplied; secrets in
 * the Cloudflare sense are operator-supplied. Different lifecycle,
 * different storage, different audit story.
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { decrypt, encrypt } from '@/server/lib/crypto'
import { serviceCredentials } from '@/server/modules/credentials/db/schema'

export interface CredentialEnv {
  DB: D1Database
  TOKEN_ENCRYPTION_KEY?: string
  // Env-supplied AI provider fallbacks. `getServiceKey` reads these
  // when no user/org credential is found.
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_AI_API_KEY?: string
  OPENROUTER_API_KEY?: string
  DEEPSEEK_API_KEY?: string
  MISTRAL_API_KEY?: string
  XAI_API_KEY?: string
  // Search providers
  SERPER_API_KEY?: string
  BRAVE_API_KEY?: string
  TAVILY_API_KEY?: string
  EXA_API_KEY?: string
  // Scraping
  FIRECRAWL_API_KEY?: string
}

/** Provider id → env var name. Single source of truth for the
 *  fallback layer. New providers register here. */
const ENV_FALLBACKS: Record<string, keyof CredentialEnv> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google_ai: 'GOOGLE_AI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  xai: 'XAI_API_KEY',
  serper: 'SERPER_API_KEY',
  brave: 'BRAVE_API_KEY',
  tavily: 'TAVILY_API_KEY',
  exa: 'EXA_API_KEY',
  firecrawl: 'FIRECRAWL_API_KEY',
}

export interface CredentialOwner {
  userId?: string
  /** Org id from the user's active org session, if any. */
  organizationId?: string
}

/**
 * Resolve a key for a provider, checking user → org → env in order.
 * Returns the decrypted plaintext, or null if no source has a key.
 *
 * Decryption failure (wrong key, tampered ciphertext) returns null
 * AND logs the error — the caller falls through to env or null and
 * the user will see a connection error from the provider rather
 * than a cryptic crash.
 */
export async function getServiceKey(
  env: CredentialEnv,
  owner: CredentialOwner,
  provider: string
): Promise<string | null> {
  const db = drizzle(env.DB)

  // 1. User credential
  if (owner.userId) {
    const [row] = await db
      .select({ encryptedValue: serviceCredentials.encryptedValue })
      .from(serviceCredentials)
      .where(
        and(
          eq(serviceCredentials.userId, owner.userId),
          eq(serviceCredentials.provider, provider),
          eq(serviceCredentials.status, 'active'),
          eq(serviceCredentials.label, 'default')
        )
      )
      .limit(1)
    if (row) {
      try {
        return await decrypt(row.encryptedValue, env.TOKEN_ENCRYPTION_KEY)
      } catch (err) {
        console.error(
          JSON.stringify({
            event: 'credential_decrypt_failed',
            provider,
            ownerType: 'user',
            error: err instanceof Error ? err.message : String(err),
          })
        )
      }
    }
  }

  // 2. Org credential
  if (owner.organizationId) {
    const [row] = await db
      .select({ encryptedValue: serviceCredentials.encryptedValue })
      .from(serviceCredentials)
      .where(
        and(
          eq(serviceCredentials.organizationId, owner.organizationId),
          eq(serviceCredentials.provider, provider),
          eq(serviceCredentials.status, 'active'),
          eq(serviceCredentials.label, 'default')
        )
      )
      .limit(1)
    if (row) {
      try {
        return await decrypt(row.encryptedValue, env.TOKEN_ENCRYPTION_KEY)
      } catch (err) {
        console.error(
          JSON.stringify({
            event: 'credential_decrypt_failed',
            provider,
            ownerType: 'org',
            error: err instanceof Error ? err.message : String(err),
          })
        )
      }
    }
  }

  // 3. Env fallback
  const envKey = ENV_FALLBACKS[provider]
  if (envKey) {
    const value = env[envKey]
    if (typeof value === 'string' && value.length > 0) return value
  }

  return null
}

/**
 * Store a credential (encrypts + writes the row). Updates if a row
 * exists for the same (owner, provider, label) tuple.
 */
export async function setServiceKey(
  env: CredentialEnv,
  owner: CredentialOwner,
  provider: string,
  plaintext: string,
  opts?: { label?: string }
): Promise<{ id: string; lastFour: string }> {
  if (!owner.userId && !owner.organizationId) {
    throw new Error('setServiceKey requires either userId or organizationId')
  }
  const label = opts?.label ?? 'default'
  const encryptedValue = await encrypt(plaintext, env.TOKEN_ENCRYPTION_KEY)
  const lastFour = plaintext.slice(-4)
  const db = drizzle(env.DB)

  // Upsert: try update first, insert on miss. SQLite ON CONFLICT
  // works but the conditional unique indexes (per-owner-type) make
  // a generic upsert clause messy — explicit query is clearer.
  const where = owner.userId
    ? and(
        eq(serviceCredentials.userId, owner.userId),
        eq(serviceCredentials.provider, provider),
        eq(serviceCredentials.label, label)
      )
    : and(
        eq(serviceCredentials.organizationId, owner.organizationId!),
        eq(serviceCredentials.provider, provider),
        eq(serviceCredentials.label, label)
      )
  const [existing] = await db
    .select({ id: serviceCredentials.id })
    .from(serviceCredentials)
    .where(where)
    .limit(1)
  if (existing) {
    await db
      .update(serviceCredentials)
      .set({
        encryptedValue,
        lastFour,
        status: 'active',
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(serviceCredentials.id, existing.id))
    return { id: existing.id, lastFour }
  }
  const id = crypto.randomUUID()
  await db.insert(serviceCredentials).values({
    id,
    ...(owner.userId && { userId: owner.userId }),
    ...(owner.organizationId && { organizationId: owner.organizationId }),
    provider,
    label,
    encryptedValue,
    lastFour,
    status: 'active',
  })
  return { id, lastFour }
}

/**
 * Revoke a credential — keeps the row for audit, marks inactive so
 * getServiceKey skips it.
 */
export async function revokeServiceKey(
  env: CredentialEnv,
  owner: CredentialOwner,
  provider: string,
  opts?: { label?: string }
): Promise<{ revoked: boolean }> {
  const label = opts?.label ?? 'default'
  const db = drizzle(env.DB)
  const where = owner.userId
    ? and(
        eq(serviceCredentials.userId, owner.userId),
        eq(serviceCredentials.provider, provider),
        eq(serviceCredentials.label, label)
      )
    : owner.organizationId
      ? and(
          eq(serviceCredentials.organizationId, owner.organizationId),
          eq(serviceCredentials.provider, provider),
          eq(serviceCredentials.label, label)
        )
      : null
  if (!where) return { revoked: false }
  const result = await db
    .update(serviceCredentials)
    .set({ status: 'revoked', updatedAt: Math.floor(Date.now() / 1000) })
    .where(where)
  // d1 update returns a result object; we treat any non-throw as success.
  return { revoked: !!result }
}

/**
 * List a user's stored credentials (no plaintext returned — only
 * provider, label, lastFour, status, dates). Used by the settings UI.
 */
export async function listServiceCredentials(
  env: CredentialEnv,
  owner: CredentialOwner
): Promise<
  Array<{
    id: string
    provider: string
    label: string
    lastFour: string | null
    status: string
    createdAt: number
    updatedAt: number
  }>
> {
  const db = drizzle(env.DB)
  const where = owner.userId
    ? eq(serviceCredentials.userId, owner.userId)
    : owner.organizationId
      ? eq(serviceCredentials.organizationId, owner.organizationId)
      : null
  if (!where) return []
  const rows = await db
    .select({
      id: serviceCredentials.id,
      provider: serviceCredentials.provider,
      label: serviceCredentials.label,
      lastFour: serviceCredentials.lastFour,
      status: serviceCredentials.status,
      createdAt: serviceCredentials.createdAt,
      updatedAt: serviceCredentials.updatedAt,
    })
    .from(serviceCredentials)
    .where(where)
  return rows
}

/** Provider catalogue — drives the settings UI's "add a key" picker. */
export const SUPPORTED_PROVIDERS: Array<{
  id: string
  name: string
  description: string
  signupUrl: string
  category: 'ai' | 'search' | 'scraping'
}> = [
  // AI
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models direct',
    signupUrl: 'https://console.anthropic.com',
    category: 'ai',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT + image generation',
    signupUrl: 'https://platform.openai.com',
    category: 'ai',
  },
  {
    id: 'google_ai',
    name: 'Google AI Studio',
    description: 'Gemini models direct',
    signupUrl: 'https://aistudio.google.com',
    category: 'ai',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified gateway to all paid models',
    signupUrl: 'https://openrouter.ai',
    category: 'ai',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'V4 / reasoning models direct',
    signupUrl: 'https://platform.deepseek.com',
    category: 'ai',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'Mistral / Codestral / Pixtral direct',
    signupUrl: 'https://console.mistral.ai',
    category: 'ai',
  },
  {
    id: 'xai',
    name: 'xAI',
    description: 'Grok models direct',
    signupUrl: 'https://x.ai/api',
    category: 'ai',
  },
  // Search
  {
    id: 'serper',
    name: 'Serper',
    description: 'Google search results — 2500/mo free',
    signupUrl: 'https://serper.dev',
    category: 'search',
  },
  {
    id: 'brave',
    name: 'Brave Search',
    description: 'Independent search index',
    signupUrl: 'https://brave.com/search/api',
    category: 'search',
  },
  {
    id: 'tavily',
    name: 'Tavily',
    description: 'AI-optimised search',
    signupUrl: 'https://tavily.com',
    category: 'search',
  },
  {
    id: 'exa',
    name: 'Exa',
    description: 'Semantic web search',
    signupUrl: 'https://exa.ai',
    category: 'search',
  },
  // Scraping
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    description: 'Scrape JS-heavy pages, crawl sites',
    signupUrl: 'https://firecrawl.dev',
    category: 'scraping',
  },
]
