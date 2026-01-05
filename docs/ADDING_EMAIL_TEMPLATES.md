# Email System

Multi-provider email abstraction for sending transactional emails through Resend, SendGrid, Mailgun, SMTP2Go, or SMTP.

**Time estimate**: 30 mins for basic setup, 1-2 hours for full templates

---

## Quick Start

```typescript
import { createEmailClient, createEmailClientFromEnv } from '@/server/lib/email'

// Option 1: Create from explicit config
const email = createEmailClient({
  provider: 'resend',
  apiKey: 're_...',
  fromEmail: 'hello@example.com',
  fromName: 'My App',
})

// Option 2: Create from environment variables (recommended)
const email = createEmailClientFromEnv(c.env)

// Send email
const result = await email.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello!</h1>',
})

if (result.success) {
  console.log('Sent:', result.messageId)
} else {
  console.error('Failed:', result.error)
}
```

---

## Supported Providers

| Provider | Best For | Features |
|----------|----------|----------|
| **Resend** (default) | Developer-friendly API | Webhooks, analytics |
| **SendGrid** | Enterprise scale | Templates, advanced analytics |
| **Mailgun** | Deliverability | Detailed logs, validation |
| **SMTP2Go** | Global sending | 24/7 support |
| **SMTP** | Legacy systems | Requires Node.js (not Workers) |

---

## Environment Variables

Set the provider and API key in your environment:

```bash
# .dev.vars (local) or Cloudflare secrets (production)
EMAIL_PROVIDER=resend           # resend, sendgrid, mailgun, smtp2go, smtp
EMAIL_FROM=hello@example.com    # Default from address
EMAIL_FROM_NAME=My App          # Default from name

# Provider-specific API keys
RESEND_API_KEY=re_xxx           # For Resend
SENDGRID_API_KEY=SG.xxx         # For SendGrid
MAILGUN_API_KEY=xxx             # For Mailgun (also needs MAILGUN_DOMAIN)
MAILGUN_DOMAIN=mg.example.com   # Mailgun sending domain
SMTP2GO_API_KEY=api-xxx         # For SMTP2Go

# SMTP (requires host, port, credentials)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=user
SMTP_PASSWORD=pass
```

### Setting Production Secrets

```bash
echo "re_xxx" | npx wrangler secret put RESEND_API_KEY
echo "resend" | npx wrangler secret put EMAIL_PROVIDER
echo "hello@example.com" | npx wrangler secret put EMAIL_FROM
npx wrangler deploy
```

---

## API Reference

### EmailClient

```typescript
class EmailClient {
  // Send a single email
  async send(options: SendOptions): Promise<SendResult>

  // Send batch emails (rate-limited)
  async sendBatch(recipients: SendOptions[]): Promise<BatchSendResult>

  // Send using provider template (SendGrid, Mailgun)
  async sendTemplate(options: SendTemplateOptions): Promise<SendResult>

  // Validate configuration
  async validate(): Promise<boolean>

  // Get current provider
  getProvider(): ProviderAlias

  // Debug info (safe to log)
  getDebugInfo(): Record<string, unknown>
}
```

### SendOptions

```typescript
interface SendOptions {
  to: string | string[] | EmailAddress | EmailAddress[]
  subject: string
  html?: string
  text?: string
  from?: string | EmailAddress  // Overrides default
  replyTo?: string | EmailAddress
  cc?: string | string[] | EmailAddress[]
  bcc?: string | string[] | EmailAddress[]
  headers?: Record<string, string>
  tags?: Record<string, string>
  metadata?: Record<string, unknown>
  attachments?: EmailAttachment[]
  scheduledAt?: Date  // For scheduled sending
}

interface EmailAddress {
  email: string
  name?: string
}

interface EmailAttachment {
  filename: string
  content: string  // Base64 encoded
  contentType?: string
}
```

### SendResult

```typescript
interface SendResult {
  success: boolean
  messageId?: string
  error?: string
  errorCode?: string
  provider: ProviderAlias
  durationMs: number
  rawResponse?: unknown
}
```

---

## Usage Examples

### Basic Email

```typescript
const result = await email.send({
  to: 'user@example.com',
  subject: 'Hello!',
  html: '<h1>Welcome!</h1>',
  text: 'Welcome!',  // Plain text fallback
})
```

### Multiple Recipients

```typescript
const result = await email.send({
  to: ['user1@example.com', 'user2@example.com'],
  cc: 'manager@example.com',
  bcc: 'audit@example.com',
  subject: 'Team Update',
  html: '<p>Here is the update...</p>',
})
```

### With Custom From Address

```typescript
const result = await email.send({
  to: 'user@example.com',
  from: { email: 'support@example.com', name: 'Support Team' },
  replyTo: 'help@example.com',
  subject: 'Support Ticket #123',
  html: '<p>Your ticket has been received.</p>',
})
```

### Batch Sending

```typescript
const result = await email.sendBatch([
  { to: 'user1@example.com', subject: 'Hello User 1', html: '...' },
  { to: 'user2@example.com', subject: 'Hello User 2', html: '...' },
  { to: 'user3@example.com', subject: 'Hello User 3', html: '...' },
])

console.log(`Sent: ${result.successCount}/${result.total}`)
```

### Provider Templates

```typescript
// SendGrid dynamic template
const result = await email.sendTemplate({
  to: 'user@example.com',
  templateId: 'd-abc123',
  templateData: {
    firstName: 'John',
    resetLink: 'https://...',
  },
})

// Mailgun template
const result = await email.sendTemplate({
  to: 'user@example.com',
  templateId: 'welcome-email',
  templateData: {
    userName: 'John',
  },
})
```

### With Attachments

```typescript
const pdfBuffer = await generatePDF()
const base64Content = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)))

const result = await email.send({
  to: 'user@example.com',
  subject: 'Your Invoice',
  html: '<p>Please find your invoice attached.</p>',
  attachments: [{
    filename: 'invoice-123.pdf',
    content: base64Content,
    contentType: 'application/pdf',
  }],
})
```

### Scheduled Sending

```typescript
const tomorrow = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)
tomorrow.setHours(9, 0, 0, 0)

const result = await email.send({
  to: 'user@example.com',
  subject: 'Good Morning!',
  html: '<p>Rise and shine!</p>',
  scheduledAt: tomorrow,
})
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
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
    .button { display: inline-block; padding: 12px 24px; background-color: #0066cc; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; }
    .footer { margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #666666; }
    .preheader { display: none; max-height: 0; overflow: hidden; }
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
    <p style="margin-top: 24px;">
      <a href="${loginUrl}" class="button">Go to Dashboard</a>
    </p>
  `

  return baseTemplate({
    preheader: `Welcome to Your App, ${userName}!`,
    content,
  })
}
```

---

## Integration Examples

### Send Welcome Email on Signup

```typescript
// In better-auth config (src/server/modules/auth/index.ts)
import { createEmailClientFromEnv } from '@/server/lib/email'
import { welcomeEmail } from '@/server/lib/email/templates/welcome'

export const auth = (env: Env) => betterAuth({
  // ... existing config

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const email = createEmailClientFromEnv(env)

          await email.send({
            to: user.email,
            subject: `Welcome to Your App, ${user.name || 'there'}!`,
            html: welcomeEmail({
              userName: user.name || 'there',
              loginUrl: `${env.BETTER_AUTH_URL}/dashboard`,
            }),
          })
        },
      },
    },
  },
})
```

### Send from API Route

```typescript
// src/server/modules/notifications/routes.ts
import { createEmailClientFromEnv } from '@/server/lib/email'

app.post('/send-notification', async (c) => {
  const email = createEmailClientFromEnv(c.env)
  const { userId, title, message } = await c.req.json()

  const user = await db.query.user.findFirst({
    where: eq(user.id, userId),
  })

  if (!user) return c.json({ error: 'User not found' }, 404)

  const result = await email.send({
    to: user.email,
    subject: title,
    html: `<p>Hi ${user.name},</p><p>${message}</p>`,
  })

  return c.json(result)
})
```

---

## Switching Providers

To switch providers, just change the environment variable:

```bash
# Switch to SendGrid
echo "sendgrid" | npx wrangler secret put EMAIL_PROVIDER
echo "SG.xxx" | npx wrangler secret put SENDGRID_API_KEY
npx wrangler deploy
```

Your code stays the same - the abstraction handles provider differences.

---

## Error Handling

```typescript
const result = await email.send({
  to: 'user@example.com',
  subject: 'Test',
  html: '<p>Test</p>',
})

if (!result.success) {
  console.error('Email failed:', {
    error: result.error,
    errorCode: result.errorCode,
    provider: result.provider,
    durationMs: result.durationMs,
  })

  // Handle specific error codes
  if (result.errorCode === 'RATE_LIMITED') {
    // Retry later
  } else if (result.errorCode === 'INVALID_EMAIL') {
    // Bad email address
  } else if (result.errorCode === 'AUTH_ERROR') {
    // Check API key
  }
}
```

### Error Codes

| Code | Meaning |
|------|---------|
| `RATE_LIMITED` | Too many requests, retry later |
| `INVALID_EMAIL` | Invalid email address format |
| `AUTH_ERROR` | Invalid API key |
| `SEND_FAILED` | General send failure |
| `PROVIDER_NOT_FOUND` | Unknown provider |
| `PROVIDER_NOT_CONFIGURED` | Missing provider config |
| `NETWORK_ERROR` | Network/connection issue |

---

## Testing

### Resend Test Addresses

- `delivered@resend.dev` - Always succeeds
- `bounced@resend.dev` - Simulates bounce

### Validate Configuration

```typescript
const email = createEmailClientFromEnv(c.env)
const isValid = await email.validate()

if (!isValid) {
  console.error('Email provider not properly configured')
}
```

### Debug Info

```typescript
const email = createEmailClientFromEnv(c.env)
console.log(email.getDebugInfo())
// { provider: 'resend', fromEmail: 'hello@...', apiKeyConfigured: true, ... }
```

---

## Provider Notes

### Resend (Default)

Best for developers. Simple API, good documentation.

### SendGrid

Supports dynamic templates with `{{variable}}` syntax. Set up templates in SendGrid dashboard.

### Mailgun

Uses FormData (not JSON). EU region available via `MAILGUN_REGION=EU`.

### SMTP2Go

Good for bulk sending with SMTP relay option.

### SMTP (Generic)

**Note**: SMTP requires raw TCP connections which are NOT supported in Cloudflare Workers. Use for:
- Local development with Node.js
- Non-Workers deployments
- Reference implementation

For Workers, use an API-based provider instead.

---

## Resources

- [Resend Documentation](https://resend.com/docs)
- [SendGrid Documentation](https://docs.sendgrid.com/)
- [Mailgun Documentation](https://documentation.mailgun.com/)
- [SMTP2Go Documentation](https://www.smtp2go.com/docs/)
- [Can I Email (compatibility)](https://www.caniemail.com/)

---

**Created**: 2026-01-03
**Updated**: 2026-01-05
**Author**: Jeremy Dawes (Jezweb)
