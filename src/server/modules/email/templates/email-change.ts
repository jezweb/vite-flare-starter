import { escape, layout } from './index'

export interface EmailChangeData {
  name?: string | null
  newEmail: string
  confirmUrl: string
  appName: string
}

export const emailChange = {
  subject: (data: EmailChangeData) => `Confirm your ${data.appName} email change`,
  html: (data: EmailChangeData) =>
    layout({
      title: 'Confirm your email change',
      body: `
        <h1 style="margin:0 0 16px 0;font-size:22px">Confirm your email change</h1>
        <p style="margin:0 0 16px 0;color:#333">Hi ${escape(data.name) || 'there'},</p>
        <p style="margin:0 0 16px 0;color:#333">You requested to change the email on your ${escape(data.appName)} account to <strong>${escape(data.newEmail)}</strong>.</p>
        <p style="margin:0 0 24px 0">
          <a href="${escape(data.confirmUrl)}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">
            Confirm change
          </a>
        </p>
        <p style="margin:0;color:#666;font-size:13px">Didn't request this? Ignore this email — your email won't change.</p>
      `,
    }),
  text: (data: EmailChangeData) =>
    `Confirm your email change to ${data.newEmail}:
${data.confirmUrl}

Didn't request this? Ignore this email.`,
}
