/**
 * SMTP2Go provider.
 *
 * HTTP API: https://api.smtp2go.com/v3/email/send
 * Auth: API key in body (or Authorization header — both accepted).
 * Free tier: 1,000 emails/month.
 *
 * Set `SMTP2GO_API_KEY` as a wrangler secret. The sender domain must
 * be verified in the SMTP2Go dashboard.
 */
import type { EmailProviderImpl } from './types'

interface Smtp2goResponse {
  data?: {
    succeeded?: number
    failed?: number
    failures?: string[]
    email_id?: string
  }
  request_id?: string
}

export const smtp2go: EmailProviderImpl = {
  id: 'smtp2go',
  isAvailable: (env) => !!env.SMTP2GO_API_KEY,
  send: async (env, message) => {
    const key = env.SMTP2GO_API_KEY
    if (!key) throw new Error('SMTP2GO_API_KEY not set')
    const resp = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        api_key: key,
        sender: message.from,
        to: message.to,
        subject: message.subject,
        html_body: message.html,
        text_body: message.text,
        ...(message.replyTo
          ? { custom_headers: [{ header: 'Reply-To', value: message.replyTo }] }
          : {}),
      }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`SMTP2Go ${resp.status}: ${body.slice(0, 200)}`)
    }
    const json = (await resp.json()) as Smtp2goResponse
    if (json.data?.failed && json.data.failed > 0) {
      throw new Error(
        `SMTP2Go reported ${json.data.failed} failures: ${(json.data.failures ?? [])
          .slice(0, 3)
          .join('; ')}`
      )
    }
    return {
      ...(json.data?.email_id ? { messageId: json.data.email_id } : {}),
    }
  },
}
