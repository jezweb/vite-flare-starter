# Adding Email Templates

Guide for extending transactional emails beyond authentication using Resend (already included in vite-flare-starter).

**Time estimate**: 1-2 hours for basic templates, 3-4 hours for full system

---

## Current State

The starter already has:
- Resend as a dependency
- Email verification in better-auth
- Password reset emails

This guide extends that to general transactional emails.

---

## Email Types

| Type | Trigger | Priority |
|------|---------|----------|
| **Welcome** | User signup | High |
| **Notifications** | Activity alerts | Medium |
| **Digest** | Weekly summary | Low (queued) |
| **Invoices** | Payment events | High |
| **Team invites** | Organization invites | High |

---

## Setup

### 1. Verify Resend Configuration

```bash
# Set API key if not already done
echo "re_xxx" | npx wrangler secret put RESEND_API_KEY
```

### 2. Create Email Module

```typescript
// src/server/lib/email/client.ts
import { Resend } from 'resend'

export function createEmailClient(apiKey: string) {
  return new Resend(apiKey)
}

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
  tags?: { name: string; value: string }[]
}

export async function sendEmail(
  client: Resend,
  options: EmailOptions,
  defaultFrom: string = 'Your App <noreply@yourapp.com>'
) {
  const { data, error } = await client.emails.send({
    from: options.from || defaultFrom,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html: options.html,
    text: options.text,
    reply_to: options.replyTo,
    tags: options.tags,
  })

  if (error) {
    throw new Error(`Email failed: ${error.message}`)
  }

  return data
}
```

---

## Email Templates

### Base Layout

```typescript
// src/server/lib/email/templates/base.ts
export interface BaseTemplateProps {
  preheader?: string
  content: string
  footerText?: string
}

export function baseTemplate({
  preheader = '',
  content,
  footerText = 'You received this email because you have an account with us.',
}: BaseTemplateProps): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.5;
      color: #1a1a1a;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #0066cc;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
    }
    .button:hover {
      background-color: #0052a3;
    }
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e5e5;
      font-size: 14px;
      color: #666666;
    }
    .preheader {
      display: none;
      max-height: 0;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div class="preheader">${preheader}</div>
  <div class="container">
    <div class="card">
      ${content}
      <div class="footer">
        <p>${footerText}</p>
        <p>© ${new Date().getFullYear()} Your App. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
`
}
```

### Welcome Email

```typescript
// src/server/lib/email/templates/welcome.ts
import { baseTemplate } from './base'

export interface WelcomeEmailProps {
  userName: string
  loginUrl: string
}

export function welcomeEmail({ userName, loginUrl }: WelcomeEmailProps): string {
  const content = `
    <h1>Welcome to Your App!</h1>
    <p>Hi ${userName},</p>
    <p>Thanks for signing up. We're excited to have you on board.</p>
    <p>Here's what you can do next:</p>
    <ul>
      <li>Complete your profile</li>
      <li>Explore the dashboard</li>
      <li>Connect with your team</li>
    </ul>
    <p style="margin-top: 24px;">
      <a href="${loginUrl}" class="button">Go to Dashboard</a>
    </p>
    <p style="margin-top: 24px;">
      If you have any questions, just reply to this email.
    </p>
  `

  return baseTemplate({
    preheader: `Welcome to Your App, ${userName}!`,
    content,
  })
}
```

### Notification Email

```typescript
// src/server/lib/email/templates/notification.ts
import { baseTemplate } from './base'

export interface NotificationEmailProps {
  userName: string
  title: string
  message: string
  actionUrl?: string
  actionText?: string
}

export function notificationEmail({
  userName,
  title,
  message,
  actionUrl,
  actionText = 'View Details',
}: NotificationEmailProps): string {
  const content = `
    <h1>${title}</h1>
    <p>Hi ${userName},</p>
    <p>${message}</p>
    ${actionUrl ? `
      <p style="margin-top: 24px;">
        <a href="${actionUrl}" class="button">${actionText}</a>
      </p>
    ` : ''}
  `

  return baseTemplate({
    preheader: title,
    content,
  })
}
```

### Weekly Digest

```typescript
// src/server/lib/email/templates/digest.ts
import { baseTemplate } from './base'

export interface DigestItem {
  title: string
  description: string
  url: string
}

export interface DigestEmailProps {
  userName: string
  weekOf: string
  stats: {
    label: string
    value: string | number
  }[]
  items: DigestItem[]
  dashboardUrl: string
}

export function digestEmail({
  userName,
  weekOf,
  stats,
  items,
  dashboardUrl,
}: DigestEmailProps): string {
  const statsHtml = stats.map(s => `
    <div style="text-align: center; padding: 16px;">
      <div style="font-size: 32px; font-weight: bold; color: #0066cc;">${s.value}</div>
      <div style="font-size: 14px; color: #666;">${s.label}</div>
    </div>
  `).join('')

  const itemsHtml = items.map(item => `
    <div style="padding: 16px 0; border-bottom: 1px solid #e5e5e5;">
      <a href="${item.url}" style="font-weight: 500; color: #0066cc; text-decoration: none;">
        ${item.title}
      </a>
      <p style="margin: 8px 0 0; color: #666; font-size: 14px;">${item.description}</p>
    </div>
  `).join('')

  const content = `
    <h1>Your Weekly Digest</h1>
    <p>Hi ${userName}, here's your summary for the week of ${weekOf}.</p>

    <div style="display: flex; justify-content: space-around; background: #f9f9f9; border-radius: 8px; margin: 24px 0; padding: 16px;">
      ${statsHtml}
    </div>

    <h2 style="margin-top: 32px;">Recent Activity</h2>
    ${itemsHtml}

    <p style="margin-top: 24px;">
      <a href="${dashboardUrl}" class="button">View Full Dashboard</a>
    </p>
  `

  return baseTemplate({
    preheader: `Your weekly summary for ${weekOf}`,
    content,
  })
}
```

### Invoice Email

```typescript
// src/server/lib/email/templates/invoice.ts
import { baseTemplate } from './base'

export interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface InvoiceEmailProps {
  userName: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  items: InvoiceItem[]
  subtotal: number
  tax: number
  total: number
  paymentUrl: string
  currency?: string
}

export function invoiceEmail({
  userName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  items,
  subtotal,
  tax,
  total,
  paymentUrl,
  currency = 'USD',
}: InvoiceEmailProps): string {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)

  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5;">${item.description}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatCurrency(item.unitPrice)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatCurrency(item.total)}</td>
    </tr>
  `).join('')

  const content = `
    <h1>Invoice ${invoiceNumber}</h1>
    <p>Hi ${userName},</p>
    <p>Please find your invoice below.</p>

    <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 24px 0;">
      <p style="margin: 0;"><strong>Invoice Date:</strong> ${invoiceDate}</p>
      <p style="margin: 8px 0 0;"><strong>Due Date:</strong> ${dueDate}</p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <thead>
        <tr style="background: #f9f9f9;">
          <th style="padding: 12px; text-align: left;">Description</th>
          <th style="padding: 12px; text-align: center;">Qty</th>
          <th style="padding: 12px; text-align: right;">Unit Price</th>
          <th style="padding: 12px; text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="padding: 12px; text-align: right;">Subtotal</td>
          <td style="padding: 12px; text-align: right;">${formatCurrency(subtotal)}</td>
        </tr>
        <tr>
          <td colspan="3" style="padding: 12px; text-align: right;">Tax</td>
          <td style="padding: 12px; text-align: right;">${formatCurrency(tax)}</td>
        </tr>
        <tr style="font-weight: bold; font-size: 18px;">
          <td colspan="3" style="padding: 12px; text-align: right;">Total</td>
          <td style="padding: 12px; text-align: right;">${formatCurrency(total)}</td>
        </tr>
      </tfoot>
    </table>

    <p style="margin-top: 24px;">
      <a href="${paymentUrl}" class="button">Pay Now</a>
    </p>
  `

  return baseTemplate({
    preheader: `Invoice ${invoiceNumber} - ${formatCurrency(total)}`,
    content,
  })
}
```

---

## Email Service

```typescript
// src/server/lib/email/service.ts
import { Resend } from 'resend'
import { welcomeEmail, type WelcomeEmailProps } from './templates/welcome'
import { notificationEmail, type NotificationEmailProps } from './templates/notification'
import { digestEmail, type DigestEmailProps } from './templates/digest'
import { invoiceEmail, type InvoiceEmailProps } from './templates/invoice'

export class EmailService {
  private client: Resend
  private defaultFrom: string

  constructor(apiKey: string, defaultFrom: string = 'Your App <noreply@yourapp.com>') {
    this.client = new Resend(apiKey)
    this.defaultFrom = defaultFrom
  }

  async sendWelcome(to: string, props: WelcomeEmailProps) {
    return this.send({
      to,
      subject: `Welcome to Your App, ${props.userName}!`,
      html: welcomeEmail(props),
      tags: [{ name: 'type', value: 'welcome' }],
    })
  }

  async sendNotification(to: string, props: NotificationEmailProps) {
    return this.send({
      to,
      subject: props.title,
      html: notificationEmail(props),
      tags: [{ name: 'type', value: 'notification' }],
    })
  }

  async sendDigest(to: string, props: DigestEmailProps) {
    return this.send({
      to,
      subject: `Your Weekly Digest - ${props.weekOf}`,
      html: digestEmail(props),
      tags: [{ name: 'type', value: 'digest' }],
    })
  }

  async sendInvoice(to: string, props: InvoiceEmailProps) {
    return this.send({
      to,
      subject: `Invoice ${props.invoiceNumber}`,
      html: invoiceEmail(props),
      tags: [{ name: 'type', value: 'invoice' }],
    })
  }

  private async send(options: {
    to: string | string[]
    subject: string
    html: string
    tags?: { name: string; value: string }[]
  }) {
    const { data, error } = await this.client.emails.send({
      from: this.defaultFrom,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      tags: options.tags,
    })

    if (error) {
      console.error('Email send error:', error)
      throw new Error(`Failed to send email: ${error.message}`)
    }

    return data
  }
}

// Factory function for use in routes
export function createEmailService(env: Env) {
  return new EmailService(env.RESEND_API_KEY, env.EMAIL_FROM || 'Your App <noreply@yourapp.com>')
}
```

---

## Integration Examples

### Send Welcome Email on Signup

```typescript
// In better-auth config (src/server/modules/auth/index.ts)
import { createEmailService } from '@/server/lib/email/service'

export const auth = (env: Env) => betterAuth({
  // ... existing config

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const emailService = createEmailService(env)

          await emailService.sendWelcome(user.email, {
            userName: user.name || 'there',
            loginUrl: `${env.BETTER_AUTH_URL}/dashboard`,
          })
        },
      },
    },
  },
})
```

### Send Notification from Route

```typescript
// src/server/modules/notifications/routes.ts
app.post('/send-email', async (c) => {
  const emailService = createEmailService(c.env)
  const { userId, title, message, actionUrl } = await c.req.json()

  // Get user email
  const user = await db.select().from(users).where(eq(users.id, userId)).get()
  if (!user) return c.json({ error: 'User not found' }, 404)

  await emailService.sendNotification(user.email, {
    userName: user.name,
    title,
    message,
    actionUrl,
  })

  return c.json({ success: true })
})
```

### Queue Emails for Async Sending

```typescript
// In route - queue the email
app.post('/trigger-digest', async (c) => {
  const users = await db.select().from(user).where(eq(user.digestEnabled, true)).all()

  for (const u of users) {
    await c.env.QUEUE.send({
      type: 'send-digest',
      payload: { userId: u.id, email: u.email },
    })
  }

  return c.json({ queued: users.length })
})

// In queue consumer
case 'send-digest':
  const emailService = createEmailService(env)
  const stats = await getWeeklyStats(db, payload.userId)
  const items = await getRecentActivity(db, payload.userId)

  await emailService.sendDigest(payload.email, {
    userName: payload.userName,
    weekOf: formatWeekOf(new Date()),
    stats,
    items,
    dashboardUrl: `${env.BETTER_AUTH_URL}/dashboard`,
  })
  break
```

---

## Testing Emails

### Preview in Browser

```typescript
// src/server/modules/email/routes.ts (development only)
app.get('/preview/:template', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    return c.json({ error: 'Not available in production' }, 403)
  }

  const template = c.req.param('template')

  const templates: Record<string, string> = {
    welcome: welcomeEmail({
      userName: 'Test User',
      loginUrl: 'https://example.com/dashboard',
    }),
    notification: notificationEmail({
      userName: 'Test User',
      title: 'New Comment',
      message: 'Someone commented on your post.',
      actionUrl: 'https://example.com/post/123',
    }),
    // Add more...
  }

  const html = templates[template]
  if (!html) {
    return c.json({ error: 'Template not found' }, 404)
  }

  return c.html(html)
})
```

### Resend Test Mode

Use Resend's test email addresses:
- `delivered@resend.dev` - Always succeeds
- `bounced@resend.dev` - Simulates bounce

---

## Common Gotchas

### 1. SPF/DKIM Setup

Verify your domain in Resend dashboard for better deliverability.

### 2. Rate Limits

Resend has rate limits. Queue high-volume emails.

### 3. HTML Email Quirks

- Use inline styles (not external CSS)
- Use tables for complex layouts
- Test in multiple clients (Gmail, Outlook, Apple Mail)

### 4. Plain Text Fallback

Always include a text version for accessibility:

```typescript
await client.emails.send({
  // ...
  html: welcomeEmail(props),
  text: `Welcome ${props.userName}! Visit ${props.loginUrl} to get started.`,
})
```

---

## Resources

- [Resend Documentation](https://resend.com/docs)
- [Email on Acid (testing)](https://www.emailonacid.com/)
- [Can I Email (compatibility)](https://www.caniemail.com/)
- [MJML (email framework)](https://mjml.io/)

---

**Created**: 2026-01-03
**Author**: Jeremy Dawes (Jezweb)
