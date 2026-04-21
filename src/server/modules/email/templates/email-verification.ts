import { escape, layout } from './index'

export interface EmailVerificationData {
  name?: string | null
  verifyUrl: string
  appName: string
}

export const emailVerification = {
  subject: (data: EmailVerificationData) => `Verify your ${data.appName} email`,
  html: (data: EmailVerificationData) =>
    layout({
      title: 'Verify your email',
      body: `
        <h1 style="margin:0 0 16px 0;font-size:22px">Verify your email</h1>
        <p style="margin:0 0 16px 0;color:#333">Welcome${data.name ? ', ' + escape(data.name) : ''}! Please confirm your email so you can sign in and get started.</p>
        <p style="margin:0 0 24px 0">
          <a href="${escape(data.verifyUrl)}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">
            Verify email
          </a>
        </p>
        <p style="margin:0;color:#666;font-size:13px">This link expires in 24 hours. If you didn't sign up for ${escape(data.appName)}, you can safely ignore this email.</p>
      `,
      footer: `If the button doesn't work, paste this URL into your browser:<br><a href="${escape(data.verifyUrl)}" style="color:#0f172a;word-break:break-all">${escape(data.verifyUrl)}</a>`,
    }),
  text: (data: EmailVerificationData) =>
    `Welcome${data.name ? ', ' + data.name : ''}!

Confirm your email to activate your ${data.appName} account:
${data.verifyUrl}

This link expires in 24 hours.`,
}
