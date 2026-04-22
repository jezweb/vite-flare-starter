import { escape, layout } from './index'

export interface MagicLinkData {
  name?: string | null
  signInUrl: string
  appName: string
  expiresInMinutes?: number
}

export const magicLink = {
  subject: (data: MagicLinkData) => `Sign in to ${data.appName}`,
  html: (data: MagicLinkData) =>
    layout({
      title: 'Your sign-in link',
      body: `
        <h1 style="margin:0 0 16px 0;font-size:22px">Sign in to ${escape(data.appName)}</h1>
        <p style="margin:0 0 16px 0;color:#333">Hi ${escape(data.name) || 'there'}, click the button below to sign in. No password needed.</p>
        <p style="margin:0 0 24px 0">
          <a href="${escape(data.signInUrl)}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">
            Sign in
          </a>
        </p>
        <p style="margin:0;color:#666;font-size:13px">Expires in ${data.expiresInMinutes ?? 15} minutes. Didn't request this? You can safely ignore it.</p>
      `,
    }),
  text: (data: MagicLinkData) =>
    `Sign in to ${data.appName}:
${data.signInUrl}

Expires in ${data.expiresInMinutes ?? 15} minutes.`,
}
