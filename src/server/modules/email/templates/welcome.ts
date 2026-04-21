import { escape, layout } from './index'

export interface WelcomeData {
  name?: string | null
  appName: string
  appUrl: string
}

export const welcome = {
  subject: (data: WelcomeData) => `Welcome to ${data.appName}`,
  html: (data: WelcomeData) =>
    layout({
      title: `Welcome to ${data.appName}`,
      body: `
        <h1 style="margin:0 0 16px 0;font-size:22px">Welcome to ${escape(data.appName)}${data.name ? ', ' + escape(data.name) : ''}!</h1>
        <p style="margin:0 0 16px 0;color:#333">Your account is ready. Sign in any time from the link below.</p>
        <p style="margin:0 0 24px 0">
          <a href="${escape(data.appUrl)}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">
            Open ${escape(data.appName)}
          </a>
        </p>
        <p style="margin:0;color:#666;font-size:13px">Reply to this email if you need a hand getting started.</p>
      `,
    }),
  text: (data: WelcomeData) =>
    `Welcome to ${data.appName}${data.name ? ', ' + data.name : ''}!

Open ${data.appName}: ${data.appUrl}

Reply to this email if you need a hand getting started.`,
}
