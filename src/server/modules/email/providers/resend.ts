/**
 * Resend provider.
 *
 * HTTP API: https://api.resend.com/emails
 * Auth: Bearer API key. Free tier: 100 emails/day, 3k/month.
 *
 * Accepts EITHER `RESEND_API_KEY` (preferred — explicit) or
 * `EMAIL_API_KEY` (legacy default for Resend, kept for backwards
 * compat with existing forks).
 */
import type { EmailProviderImpl } from './types'

export const resend: EmailProviderImpl = {
  id: 'resend',
  isAvailable: (env) => !!(env.RESEND_API_KEY ?? env.EMAIL_API_KEY),
  send: async (env, message) => {
    const apiKey = env.RESEND_API_KEY ?? env.EMAIL_API_KEY
    if (!apiKey) throw new Error('Resend API key not set (RESEND_API_KEY or EMAIL_API_KEY)')
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`Resend ${resp.status}: ${body.slice(0, 200)}`)
    }
    const json = (await resp.json()) as { id?: string }
    return { ...(json.id ? { messageId: json.id } : {}) }
  },
}
