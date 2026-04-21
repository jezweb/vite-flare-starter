# Email Integration — Design Doc

**Status**: Approved 2026-04-21, not yet implemented.
**Scope**: Add outbound email sending as a first-class capability in the starter — usable by auth flows, admin features, and the agent chat. Dual-path: Cloudflare Email Service (new, full transactional) as primary, Email Routing SendEmail binding as fallback.

**Owning problem**: "How does this app send an email?" — password reset, invites, notifications, agent-initiated email, test harness.

---

## Why now

1. Cloudflare Email Service went GA — proper outbound transactional email with DKIM/SPF/DMARC auto-configured, Workers binding, no third-party dependency
2. Jez just shipped it in the GitHub MCP server — the pattern is fresh and validated
3. Every business-app fork of this starter will need it — better-auth flows (password reset, magic link, email verification) are unwired today because there's no email layer
4. Fits cleanly alongside the other planned phases without blocking anything

---

## Two paths, one wrapper

| | Email Service (new) | SendEmail binding (Email Routing) |
|---|---|---|
| Binding | `env.EMAIL.send({ to, from, subject, html, text })` | `env.SEND_EMAIL.send(emailMessage)` using `EmailMessage` + mimetext |
| Recipients | Any email address | Verified destinations only (allowlist or Email Routing domain) |
| Setup | Cloudflare DNS + "Email Sending" domain onboarding (auto SPF/DKIM/DMARC + bounce MX) | Email Routing enabled on sender domain + verified destinations |
| Use case | Transactional (password reset, invites, receipts, customer comms) | Dev, internal team notifications, "email myself" |
| Cost | Pay-as-you-go | Free (within Workers request limits) |

**Module design**: a thin service wrapper that prefers Email Service when the binding is present, falls back to SendEmail for small/dev setups. Forks choose by providing one binding or the other in `wrangler.jsonc`.

---

## Module structure

```
src/server/modules/email/
  service.ts            — sendEmail() wrapper, binding detection, retries
  templates/
    index.ts            — typed template registry
    password-reset.ts   — subject, html, text (with variable substitution)
    magic-link.ts
    invite.ts
    welcome.ts
    notification.ts
  queue.ts              — optional Queue consumer (async retries, backoff)
  routes.ts             — admin routes: /test, /logs
  db/schema.ts          — email_log table
```

### `service.ts` API

```ts
export interface SendEmailInput {
  to: string | string[]
  from?: string                      // defaults to env.EMAIL_FROM
  replyTo?: string
  subject: string
  html: string
  text?: string                      // auto-derived from html if omitted
  template?: keyof typeof templates  // if set, ignore subject/html/text — render template
  templateData?: Record<string, unknown>
  tags?: string[]                    // for filtering in logs
}

export async function sendEmail(env: Env, input: SendEmailInput): Promise<SendResult> {
  // 1. Render template if specified
  // 2. Pick binding (EMAIL > SEND_EMAIL)
  // 3. Send with one retry on transient failure
  // 4. Log to email_log D1 table
  // 5. Return { messageId, provider, status }
}
```

### `email_log` schema

```sql
CREATE TABLE email_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES user(id),
  to_address TEXT NOT NULL,
  from_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT,
  provider TEXT NOT NULL,            -- 'email-service' | 'send-email-binding'
  status TEXT NOT NULL,              -- 'queued' | 'sent' | 'failed'
  message_id TEXT,                   -- provider message ID
  error TEXT,
  tags TEXT,                         -- JSON array
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX email_log_user_idx ON email_log(user_id, sent_at);
```

Powers:
- Admin Panel → Email logs view (last 100 sent, filter by template, status, user)
- User's "recent activity" — "password reset email sent at 2:35pm"
- Rate-limiting ("this user has had 5 password-reset emails in the last hour — suspicious")

### Templates

Simple string-template approach (not React Email — keep the fork-lightweight). Each template exports:

```ts
export const passwordReset = {
  subject: 'Reset your password',
  html: ({ name, resetUrl }: Data) => `<h1>Hi ${escape(name)},</h1>
    <p>Click <a href="${escape(resetUrl)}">here</a> to reset your password.</p>
    <p>This link expires in 1 hour.</p>`,
  text: ({ name, resetUrl }: Data) =>
    `Hi ${name},\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
}
```

Typed template keys so callers can't mis-type: `sendEmail(env, { template: 'passwordReset', templateData: { name, resetUrl } })`.

Include base HTML wrapper with dark-mode-friendly styling + unsubscribe footer for notifications (not transactional).

### Queue consumer (optional)

For high-volume sends or retry-on-failure resilience, add a Queue producer/consumer pattern:

```ts
// wrangler.jsonc
"queues": {
  "producers": [{ "binding": "EMAIL_QUEUE", "queue": "email-queue" }],
  "consumers": [{ "queue": "email-queue", "max_batch_size": 10 }]
}

// service.ts
export async function queueEmail(env: Env, input: SendEmailInput) {
  await env.EMAIL_QUEUE.send(input)
  return { status: 'queued' }
}

// index.ts (worker export)
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<SendEmailInput>, env: Env) {
    for (const msg of batch.messages) {
      try {
        await sendEmail(env, msg.body)
      } catch (err) {
        msg.retry({ delaySeconds: 60 })
      }
    }
  },
}
```

Starter ships with direct-send by default (`sendEmail`), queue helper as an opt-in path for fork with high volume.

---

## Integration points

### 1. better-auth (password reset, magic link, email verification)

`src/server/modules/auth/config.ts`:

```ts
betterAuth({
  database: env.DB,
  emailAndPassword: {
    enabled: env.ENABLE_EMAIL_LOGIN === 'true',
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(env, {
        to: user.email,
        template: 'passwordReset',
        templateData: { name: user.name, resetUrl: url },
      })
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(env, { template: 'emailVerification', to: user.email, templateData: { url } })
    },
  },
})
```

This is the killer win — fork enables email/password auth, it Just Works.

### 2. Admin — invite user

Admin Panel → Users → "Invite user" button opens a form (email + role). Sends an invite email with a signup link scoped to that email.

New endpoint: `POST /api/admin/invites` with zValidator, logged to activity, uses the `invite` template.

### 3. Agent chat tool

```ts
// src/server/modules/chat/tools/email.ts
export function buildEmailTools(env: Env, userId: string) {
  if (!env.EMAIL && !env.SEND_EMAIL) return {}
  return {
    send_email: tool({
      description: 'Send an email. Use for follow-ups, summaries, invites, notifications. Always confirm with the user before sending.',
      inputSchema: z.object({
        to: z.string().email(),
        subject: z.string().max(200),
        body: z.string().describe('Plain-text body (HTML will be derived)'),
      }),
      execute: async ({ to, subject, body }) => {
        const result = await sendEmail(env, {
          to, subject, text: body,
          html: markdownToHtml(body),
          tags: [`user:${userId}`, 'chat-sent'],
        })
        return result
      },
    }),
  }
}
```

Flagged `needsApproval: true` so the AI SDK surfaces a confirm dialog before firing. Pairs naturally with the Phase 4 per-tool policy system — default `ask` for destructive tools.

### 4. Async notifications

Combine with existing notifications module: when a user gets an in-app notification, optionally email them based on their preference:

```ts
await createNotification(env, { userId, title, message })
const prefs = await getNotificationPrefs(env, userId)
if (prefs.emailOnNotification) {
  await sendEmail(env, {
    to: user.email,
    template: 'notification',
    templateData: { title, message, inAppUrl: getAppUrl(env) },
  })
}
```

Falls on existing notifications schema. Tiny addition.

---

## Wrangler configuration

`wrangler.jsonc` — both bindings documented, only one needed:

```jsonc
{
  // ... existing bindings

  // Email Service (new, transactional) — recommended
  "send_email": [{
    "name": "EMAIL",
    "type": "service"
  }],

  // OR: Email Workers (simpler, verified-destinations-only)
  // "send_email": [{
  //   "name": "SEND_EMAIL",
  //   "destination_address": "you@example.com"
  // }]
}
```

+ `EMAIL_FROM=welcome@yourdomain.com` in `.dev.vars` / secrets for the default sender.

Doc in CLAUDE.md + `.dev.vars.example` which binding to pick. Default the starter to Email Service with a commented-out fallback.

---

## Phasing

### Phase 3.1 — Core wrapper + password-reset flow (~4 hrs)
- `email_log` migration
- `service.ts` with Email Service primary, SendEmail fallback detection
- Password-reset template
- Wire into better-auth `sendResetPassword`
- Admin test endpoint `/api/email/test` (admin-only)

### Phase 3.2 — Template set + admin invite (~4 hrs)
- Magic-link, invite, welcome, notification, email-verification templates
- Admin Panel invite-user UI
- Activity log entries for each send

### Phase 3.3 — Agent tool + approval UX (~2 hrs)
- `send_email` tool with `needsApproval: true`
- Inline confirmation before send (reuse `confirm_action` UI pattern)

### Phase 3.4 — Queue consumer (optional, ~3 hrs)
- Queue producer in `sendEmail` when env var `EMAIL_ASYNC=true`
- Consumer with retry + dead-letter
- Bulk-send pattern for batch notifications

### Phase 3.5 — Email log viewer (~2 hrs)
- Admin Panel → Email logs tab
- Filter by template, status, user, tag
- Reuse existing pagination from activity module

**Total: ~1.5-2 days of focused work.** Phases 3.1 + 3.3 are the 80/20 — ship those first, the rest is polish.

---

## Risks / trade-offs

| Risk | Mitigation |
|------|------------|
| Domain setup is per-fork — no zero-config | Clear docs + CLAUDE.md + wrangler error message if binding missing |
| Email Service pricing unknown — could surprise high-volume forks | Document estimated cost once Cloudflare publishes rates; queue + rate-limit in service wrapper |
| Deliverability depends on domain reputation | Pre-warn in docs: "first few hundred emails may go to spam — expected" |
| Agent send_email misused for spam | `needsApproval: true`, rate limit 10/day per user by default, flag in policies |
| Template HTML rendering quirks (Outlook, dark mode) | Ship plain base wrapper, point forks at MJML or React Email if they need richer |
| Auth flow regressions when sendReset is broken | Fall back to console.log of the reset URL in development; surface clear error UI in production |
| DMARC failures if email is proxied | Email Service auto-configures DMARC on the `cf-bounce` subdomain; document the implication |

---

## Docs + rule updates needed

Add to CLAUDE.md under "Cloudflare Platform Features":

```markdown
### Email Sending

The starter supports outbound email via two Cloudflare mechanisms, wrapped in a single `sendEmail` helper:

**Email Service (recommended)** — transactional email to any recipient. Requires Cloudflare DNS + domain onboarding in the Email Sending section of the dashboard. SPF/DKIM/DMARC/bounce MX auto-configured.

**Email Routing SendEmail binding** — simpler dev/internal path. Can only send to verified destinations.

Pick one in wrangler.jsonc. See `src/server/modules/email/` for the wrapper, templates, and better-auth integration.
```

Add to `~/.claude/rules/cloudflare-email-sending.md`:

- Email Service requires `remote = true` in wrangler for wrangler dev
- Both paths use `[[send_email]]` wrangler config but different shapes
- Template string escaping matters — use `escape()` from shared utils in every template
- Queue consumer must be exported at the worker's default export level, not inside a nested module
- Dev fallback: if no binding is present, log the email to console instead of throwing — prevents dev-setup friction

---

**Last updated**: 2026-04-21
