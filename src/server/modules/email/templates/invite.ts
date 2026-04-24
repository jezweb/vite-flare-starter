import { escape, layout } from './index'

export interface InviteData {
  /** Display name of the person being invited (optional — often unknown) */
  name?: string | null
  /** Who sent the invite */
  inviterName: string
  inviterEmail: string
  /** Workspace / team / organisation being joined */
  organizationName: string
  /** Sign-up URL scoped to this invite (usually includes an invite token) */
  signUpUrl: string
  /** Optional message from the inviter — rendered verbatim, no markdown */
  message?: string
  appName: string
}

export const invite = {
  subject: (data: InviteData) => `${data.inviterName} invited you to ${data.organizationName}`,
  html: (data: InviteData) =>
    layout({
      title: `Invite to ${data.organizationName}`,
      body: `
        <h1 style="margin:0 0 16px 0;font-size:22px">You're invited to ${escape(data.organizationName)}</h1>
        <p style="margin:0 0 16px 0;color:#333">
          ${escape(data.inviterName)} (<a href="mailto:${escape(data.inviterEmail)}" style="color:#0f172a">${escape(data.inviterEmail)}</a>) invited you to join <strong>${escape(data.organizationName)}</strong> on ${escape(data.appName)}.
        </p>
        ${data.message ? `<blockquote style="margin:0 0 20px 0;padding:12px 16px;border-left:3px solid #e5e5e5;color:#555;background:#fafafa;border-radius:4px">${escape(data.message).replace(/\n/g, '<br>')}</blockquote>` : ''}
        <p style="margin:0 0 24px 0">
          <a href="${escape(data.signUpUrl)}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">
            Accept invite
          </a>
        </p>
        <p style="margin:0;color:#666;font-size:13px">If you weren't expecting this invite, you can safely ignore the email.</p>
      `,
    }),
  text: (data: InviteData) =>
    `${data.inviterName} (${data.inviterEmail}) invited you to join ${data.organizationName} on ${data.appName}.
${data.message ? '\n"' + data.message + '"\n' : ''}
Accept the invite:
${data.signUpUrl}`,
}
