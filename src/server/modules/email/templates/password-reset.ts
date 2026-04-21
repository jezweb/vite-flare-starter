import { escape, layout } from './index'

export interface PasswordResetData {
  name?: string | null
  resetUrl: string
  appName: string
}

export const passwordReset = {
  subject: (data: PasswordResetData) => `Reset your ${data.appName} password`,
  html: (data: PasswordResetData) =>
    layout({
      title: 'Reset your password',
      body: `
        <h1 style="margin:0 0 16px 0;font-size:22px;color:#111">Reset your password</h1>
        <p style="margin:0 0 16px 0;color:#333">Hi ${escape(data.name) || 'there'},</p>
        <p style="margin:0 0 16px 0;color:#333">You asked to reset your ${escape(data.appName)} password. Click the button below to choose a new one.</p>
        <p style="margin:0 0 24px 0">
          <a href="${escape(data.resetUrl)}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">
            Reset password
          </a>
        </p>
        <p style="margin:0 0 8px 0;color:#666;font-size:13px">This link expires in 1 hour and can only be used once.</p>
        <p style="margin:0;color:#666;font-size:13px">Didn't request this? You can safely ignore this email — your password won't change.</p>
      `,
      footer: `For security, this link only works once. If the button doesn't work, paste this URL into your browser: <br><a href="${escape(data.resetUrl)}" style="color:#0f172a;word-break:break-all">${escape(data.resetUrl)}</a>`,
    }),
  text: (data: PasswordResetData) =>
    `Hi ${data.name || 'there'},

You asked to reset your ${data.appName} password.

Open this link to choose a new one:
${data.resetUrl}

This link expires in 1 hour and can only be used once. If you didn't request a reset, you can safely ignore this email.`,
}
