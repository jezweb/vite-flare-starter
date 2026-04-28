/**
 * Cloudflare Email Routing provider — older send-from-Worker binding.
 *
 * Binding: env.SEND_EMAIL (configured via `send_email` with
 * `destination_address`). Restricted to verified destinations only —
 * primarily useful for internal alerting.
 *
 * Requires the `mimetext` package + the `cloudflare:email` runtime
 * module to construct the RFC 5322 message. We dynamic-import both
 * so apps that don't use this provider don't need the dep.
 */
import type { EmailProviderImpl } from './types'

export const cloudflareEmailRouting: EmailProviderImpl = {
  id: 'email-routing-send',
  isAvailable: (env) => !!env.SEND_EMAIL,
  send: async (env, message) => {
    if (!env.SEND_EMAIL) throw new Error('Email Routing binding not configured')
    const to = message.to[0]
    if (!to) throw new Error('Email Routing send requires at least one recipient')

    // Dynamic-import the optional deps. mimetext is small but adds bundle
    // size; cloudflare:email is a Workers runtime module only available
    // when SEND_EMAIL is configured. Both must be present at runtime.
    const mimetext = await import(/* @vite-ignore */ 'mimetext' as string).catch(() => null)
    const cfEmail = await import(/* @vite-ignore */ 'cloudflare:email' as string).catch(() => null)
    if (!mimetext || !cfEmail) {
      throw new Error(
        'Email Routing send requires `mimetext` (run `pnpm add mimetext`).',
      )
    }

    const factory = mimetext as {
      createMimeMessage: () => {
        setSender: (s: string) => void
        setRecipient: (r: string) => void
        setSubject: (s: string) => void
        addMessage: (m: { contentType: string; data: string }) => void
        asRaw: () => string
      }
    }
    const msg = factory.createMimeMessage()
    msg.setSender(message.from)
    msg.setRecipient(to)
    msg.setSubject(message.subject)
    msg.addMessage({ contentType: 'text/plain', data: message.text })
    msg.addMessage({ contentType: 'text/html', data: message.html })
    const EmailMessage = (cfEmail as {
      EmailMessage: new (from: string, to: string, raw: string) => unknown
    }).EmailMessage
    const built = new EmailMessage(message.from, to, msg.asRaw())
    await env.SEND_EMAIL.send(built)
    return {}
  },
}
