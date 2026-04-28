/**
 * Provider registry — single source of truth for the priority order.
 *
 * Default order (first available wins, rest skipped unless
 * EMAIL_FAILOVER='true'):
 *
 *   1. email-service        — Cloudflare native binding (cleanest)
 *   2. smtp2go              — Australian SMTP relay, used by Jezweb
 *   3. mailgun              — common alternative
 *   4. resend               — easy free tier, HTTP-only
 *   5. email-routing-send   — Email Routing legacy binding
 *   6. console              — dev fallback, always available
 *
 * Override at runtime via the EMAIL_PROVIDER_ORDER env (comma-separated
 * provider ids). Example:
 *   EMAIL_PROVIDER_ORDER="smtp2go,email-service,resend"
 *
 * The console provider is always appended last regardless — it's the
 * "never fail" safety net.
 */
import { cloudflareEmailService } from './cloudflare-email-service'
import { cloudflareEmailRouting } from './cloudflare-email-routing'
import { smtp2go } from './smtp2go'
import { mailgun } from './mailgun'
import { resend } from './resend'
import { consoleProvider } from './console'
import type { EmailEnv, EmailProvider, EmailProviderImpl } from './types'

const ALL_PROVIDERS: EmailProviderImpl[] = [
  cloudflareEmailService,
  smtp2go,
  mailgun,
  resend,
  cloudflareEmailRouting,
  consoleProvider,
]

const PROVIDERS_BY_ID = new Map<EmailProvider, EmailProviderImpl>(
  ALL_PROVIDERS.map((p) => [p.id, p]),
)

/**
 * Build the active provider list for this request — ordered, deduped,
 * filtered by availability. Always ends with `console` so failover
 * has a guaranteed terminal that never throws.
 */
export function resolveProviderList(env: EmailEnv): EmailProviderImpl[] {
  // Optional override via EMAIL_PROVIDER_ORDER — unknown ids dropped.
  const order = parseOrder(env.EMAIL_PROVIDER_ORDER)
  const ordered: EmailProviderImpl[] = []
  const seen = new Set<EmailProvider>()

  if (order.length > 0) {
    for (const id of order) {
      const p = PROVIDERS_BY_ID.get(id)
      if (p && !seen.has(p.id)) {
        ordered.push(p)
        seen.add(p.id)
      }
    }
  }
  // Append the rest of the default order for any not yet covered, so
  // an override of just one or two providers still gets sensible
  // fallbacks for the remainder.
  for (const p of ALL_PROVIDERS) {
    if (!seen.has(p.id)) {
      ordered.push(p)
      seen.add(p.id)
    }
  }

  // Filter to available providers. Console is always available so it
  // sits at the tail.
  return ordered.filter((p) => p.isAvailable(env))
}

function parseOrder(raw: string | undefined): EmailProvider[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim() as EmailProvider)
    .filter((s) => s.length > 0)
}

export type { EmailEnv, EmailProvider, EmailProviderImpl, NormalisedMessage, ProviderSendResult } from './types'
