import { escape, layout } from './index'

export interface NotificationData {
  name?: string | null
  title: string
  message: string
  inAppUrl?: string
  appName: string
  /** Unsubscribe URL — required for non-transactional emails */
  unsubscribeUrl?: string
}

export const notification = {
  subject: (data: NotificationData) => data.title,
  html: (data: NotificationData) =>
    layout({
      title: data.title,
      body: `
        <h1 style="margin:0 0 16px 0;font-size:20px">${escape(data.title)}</h1>
        <p style="margin:0 0 16px 0;color:#333">Hi ${escape(data.name) || 'there'},</p>
        <p style="margin:0 0 24px 0;color:#333;white-space:pre-wrap">${escape(data.message).replace(/\n/g, '<br>')}</p>
        ${
          data.inAppUrl
            ? `<p style="margin:0 0 24px 0">
          <a href="${escape(data.inAppUrl)}" style="display:inline-block;padding:10px 16px;background:#f3f4f6;color:#111;text-decoration:none;border-radius:8px;font-weight:500;border:1px solid #e5e5e5">
            View in ${escape(data.appName)}
          </a>
        </p>`
            : ''
        }
      `,
      footer: data.unsubscribeUrl
        ? `You're receiving this because notifications are enabled for your account. <a href="${escape(data.unsubscribeUrl)}" style="color:#0f172a">Unsubscribe</a>`
        : undefined,
    }),
  text: (data: NotificationData) =>
    `${data.title}

Hi ${data.name || 'there'},

${data.message}
${data.inAppUrl ? '\nView in ' + data.appName + ': ' + data.inAppUrl : ''}
${data.unsubscribeUrl ? '\n---\nUnsubscribe: ' + data.unsubscribeUrl : ''}`,
}
