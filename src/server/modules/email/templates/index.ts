/**
 * Typed template registry.
 *
 * Each template exports `subject`, `html`, and `text`. Callers reference
 * templates by key — TypeScript guarantees the data shape matches.
 *
 * Per our LLM prompting rule: we prefer one worked example per template
 * over rigid placeholders. These are the "target quality bar" for forks
 * to match when adding new templates.
 */
import { passwordReset, type PasswordResetData } from './password-reset'
import { magicLink, type MagicLinkData } from './magic-link'
import { invite, type InviteData } from './invite'
import { welcome, type WelcomeData } from './welcome'
import { notification, type NotificationData } from './notification'
import { emailVerification, type EmailVerificationData } from './email-verification'
import { emailChange, type EmailChangeData } from './email-change'
import { deleteAccount, type DeleteAccountData } from './delete-account'

export const templates = {
  passwordReset,
  magicLink,
  invite,
  welcome,
  notification,
  emailVerification,
  emailChange,
  deleteAccount,
} as const

export type TemplateKey = keyof typeof templates

/**
 * Discriminated union mapping each template key to its data shape. Used by
 * the `sendEmail` wrapper to enforce `templateData` matches `template`.
 */
export type TemplateDataMap = {
  passwordReset: PasswordResetData
  magicLink: MagicLinkData
  invite: InviteData
  welcome: WelcomeData
  notification: NotificationData
  emailVerification: EmailVerificationData
  emailChange: EmailChangeData
  deleteAccount: DeleteAccountData
}

/** HTML-escape untrusted values that land inside a template. */
export function escape(input: string | null | undefined): string {
  if (!input) return ''
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Wrap template HTML in a minimal, dark-mode-friendly layout. */
export function layout({ title, body, footer }: { title: string; body: string; footer?: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr>
          <td style="padding:32px 32px 24px 32px">
            ${body}
          </td>
        </tr>
        ${footer ? `<tr><td style="padding:0 32px 24px 32px;border-top:1px solid #eee;color:#666;font-size:12px">${footer}</td></tr>` : ''}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

/** Derive a plain-text body from a rendered HTML string. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
