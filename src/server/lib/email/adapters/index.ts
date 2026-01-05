/**
 * Email Adapters - Barrel Exports
 */

export { BaseEmailProvider, type EmailProvider, type EmailProviderFactory } from './base'
export { ResendProvider, createResendProvider } from './resend'
export { SendGridProvider, createSendGridProvider } from './sendgrid'
export { MailgunProvider, createMailgunProvider } from './mailgun'
export { SMTP2GoProvider, createSMTP2GoProvider } from './smtp2go'
export { SMTPProvider, createSMTPProvider, buildRFC2822Message } from './smtp'
