/**
 * Cloudflare Email Service provider.
 *
 * Binding: env.EMAIL (configured via `send_email` in wrangler.jsonc).
 * Status: beta as of April 2026. Available on Workers Paid plan.
 * Setup:
 *   1. Cloudflare dashboard → Compute & AI → Email Service → Onboard Domain
 *   2. Add the SPF + DKIM DNS records (auto if domain on Cloudflare DNS)
 *   3. Uncomment the `send_email` block in wrangler.jsonc
 *   4. wrangler deploy
 *
 * Returns `{ messageId }` per current docs; older builds returned
 * `{ id }`. Both are accepted.
 */
import type { EmailProviderImpl } from './types'

export const cloudflareEmailService: EmailProviderImpl = {
  id: 'email-service',
  isAvailable: (env) => !!env.EMAIL,
  send: async (env, message) => {
    if (!env.EMAIL) throw new Error('Cloudflare Email Service binding not configured')
    const res = await env.EMAIL.send({
      from: message.from,
      to: message.to.length === 1 ? message.to[0]! : message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    })
    const r = res as { messageId?: string; id?: string } | undefined
    return { ...(r?.messageId ?? r?.id ? { messageId: r?.messageId ?? r?.id! } : {}) }
  },
}
