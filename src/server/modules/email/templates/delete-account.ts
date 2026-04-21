import { escape, layout } from './index'

export interface DeleteAccountData {
  name?: string | null
  confirmUrl: string
  appName: string
}

export const deleteAccount = {
  subject: (data: DeleteAccountData) => `Confirm account deletion — ${data.appName}`,
  html: (data: DeleteAccountData) =>
    layout({
      title: 'Confirm account deletion',
      body: `
        <h1 style="margin:0 0 16px 0;font-size:22px;color:#b91c1c">Confirm account deletion</h1>
        <p style="margin:0 0 16px 0;color:#333">Hi ${escape(data.name) || 'there'},</p>
        <p style="margin:0 0 16px 0;color:#333">You asked to delete your ${escape(data.appName)} account. This is permanent — all your data will be removed.</p>
        <p style="margin:0 0 24px 0">
          <a href="${escape(data.confirmUrl)}" style="display:inline-block;padding:12px 20px;background:#b91c1c;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">
            Delete my account
          </a>
        </p>
        <p style="margin:0;color:#666;font-size:13px"><strong>If you didn't request this</strong>, change your password immediately and ignore this email. The link expires in 24 hours.</p>
      `,
    }),
  text: (data: DeleteAccountData) =>
    `Confirm deletion of your ${data.appName} account:
${data.confirmUrl}

This is permanent. If you didn't request this, change your password immediately and ignore this email.`,
}
