/**
 * Mailgun provider.
 *
 * HTTP API: https://api.mailgun.net/v3/{domain}/messages (or .eu region)
 * Auth: HTTP Basic with username 'api' + API key.
 * Tier: pay-as-you-go (no free tier as of April 2026). 1k emails / $1.
 *
 * Required wrangler secrets:
 *   - MAILGUN_API_KEY     — sending API key (private key)
 *   - MAILGUN_DOMAIN      — verified sending domain (e.g. mg.example.com)
 *   - MAILGUN_REGION?     — 'us' (default) or 'eu'
 */
import type { EmailProviderImpl } from './types'

export const mailgun: EmailProviderImpl = {
  id: 'mailgun',
  isAvailable: (env) => !!(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN),
  send: async (env, message) => {
    const apiKey = env.MAILGUN_API_KEY
    const domain = env.MAILGUN_DOMAIN
    if (!apiKey || !domain) throw new Error('MAILGUN_API_KEY + MAILGUN_DOMAIN required')

    // Default to US region. EU users set MAILGUN_REGION=eu.
    const baseUrl =
      env.MAILGUN_REGION === 'eu'
        ? 'https://api.eu.mailgun.net/v3'
        : 'https://api.mailgun.net/v3'

    // Mailgun expects multipart/form-data OR application/x-www-form-urlencoded.
    // URL-encoded is simpler and lets us use a single fetch without the
    // FormData/Content-Type round trip.
    const params = new URLSearchParams()
    params.set('from', message.from)
    for (const r of message.to) params.append('to', r)
    params.set('subject', message.subject)
    if (message.html) params.set('html', message.html)
    if (message.text) params.set('text', message.text)
    if (message.replyTo) params.set('h:Reply-To', message.replyTo)

    const auth = btoa(`api:${apiKey}`)
    const resp = await fetch(`${baseUrl}/${domain}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`Mailgun ${resp.status}: ${body.slice(0, 200)}`)
    }
    const json = (await resp.json()) as { id?: string; message?: string }
    return { ...(json.id ? { messageId: json.id } : {}) }
  },
}
