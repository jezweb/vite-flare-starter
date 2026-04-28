/**
 * Console fallback — never fails, never sends. Logs the attempt as
 * structured JSON so dev can see what would have been sent.
 *
 * Always available. Sits at the very end of the provider list and
 * catches the case where nothing else is configured (or every other
 * provider failed if EMAIL_FAILOVER='true').
 */
import type { EmailProviderImpl } from './types'

export const consoleProvider: EmailProviderImpl = {
  id: 'console',
  isAvailable: () => true,
  send: async (_env, message) => {
    console.log(
      JSON.stringify({
        event: 'email_console_fallback',
        to: message.to,
        from: message.from,
        subject: message.subject,
        hint: 'No email provider configured. Set EMAIL binding (Cloudflare Email Service), SMTP2GO_API_KEY, MAILGUN_API_KEY+MAILGUN_DOMAIN, or RESEND_API_KEY.',
      }),
    )
    return {}
  },
}
