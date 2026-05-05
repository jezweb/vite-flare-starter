# Email Inbound Handler

Ingest email through Cloudflare Email Routing → Worker `email()` export →
parse with postal-mime → store metadata + attachments → let an async
routine handle the slow extraction work.

**Time estimate**: 30 mins for the wiring + 30 mins for a triage routine.

---

## Why this pattern

Email is a common ingestion point for client-facing AI products: a
broker forwards a policy PDF, a salesperson forwards a quote request,
a support team CCs the inbox on customer threads. Treating email as a
webhook gives every downstream agent the same shape to work with.

The pattern splits the work into two parts so neither is fragile:

| Step | Latency budget | What it does |
|---|---|---|
| Email handler (this doc) | < 1s | Parse, persist metadata + attachments to D1 + R2, mark pending |
| Triage routine ([`ROUTINES.md`](./ROUTINES.md)) | seconds–minutes | Pick up pending rows, run extraction tools, emit findings |

The handler stays fast and reliable. The routine does the slow LLM
work and is observable per-fire in `routine_runs`. Decoupled by the
`status` field on the inbound row.

```
Cloudflare Email Routing                       Routine cron tick
  │                                              (every 15 min)
  ▼                                              │
  Worker.email(message, env, ctx)                ▼
    │                                            for each pending row:
    ├── postal-mime → parsed                     ├── analyse attachments
    ├── put attachments → R2                     ├── emit findings via inbox_add
    └── insert inbound_emails (status=pending) ──┴── mark complete
```

---

## 1. Wire the `email()` export

Cloudflare Workers expose `email()` alongside `fetch()` and
`scheduled()`. The runtime invokes it for every Email-Routed message.

Add to `src/server/index.ts`:

```typescript
import { handleInboundEmail } from './modules/email-inbound/handler'

export default {
  async fetch(request, env, ctx) { /* existing routing */ },
  async scheduled(event, env) { /* existing cron handler */ },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    await handleInboundEmail(message, env, ctx)
  },
}
```

Don't throw inside `email()` — Cloudflare retries the whole message
indefinitely on uncaught errors. The handler logs and drops on failure
instead, marking the row `status=error` so the triage routine can
retry the soft work.

Wire the route in your domain in the Cloudflare dashboard:
**Email Routing → Email Workers → Send to Worker → vite-flare-starter**.

---

## 2. Schema

Add an `inbound_emails` table. Schema mirrors rightcover's production
shape (a single-tenant insurance broker app):

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { entities } from '@/server/modules/entities/db/schema'

export const inboundEmails = sqliteTable(
  'inbound_emails',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

    /** RFC 822 Message-ID — used for dedup. */
    messageId: text('message_id'),

    fromEmail: text('from_email'),
    fromName: text('from_name'),
    toEmail: text('to_email'),
    subject: text('subject'),
    bodyText: text('body_text'),

    /** When a user forwards an email, who sent it originally. */
    forwardedBy: text('forwarded_by'),
    originalSender: text('original_sender'),

    attachmentCount: integer('attachment_count').notNull().default(0),

    /** pending / processing / complete / failed / ignored / error */
    status: text('status').notNull().default('pending'),
    error: text('error'),

    /** Matched (or auto-created) contact entity. */
    contactId: text('contact_id').references(() => entities.id, { onDelete: 'set null' }),

    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    processedAt: integer('processed_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('inbound_emails_status_idx').on(table.status),
    index('inbound_emails_contact_idx').on(table.contactId),
    index('inbound_emails_message_id_idx').on(table.messageId),
  ],
)
```

Three indexes earn their place: `status` for the triage routine's poll
query, `contact_id` for "show all email from this contact", and
`message_id` for dedup against retries.

---

## 3. Handler scaffold

`src/server/modules/email-inbound/handler.ts`:

```typescript
import PostalMime from 'postal-mime'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { inboundEmails } from './db/schema'
import { entities } from '@/server/modules/entities/db/schema'
import { files } from '@/server/modules/files/db/schema'

interface EmailEnv {
  DB: D1Database
  FILES: R2Bucket
  ADMIN_EMAILS?: string
}

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: EmailEnv,
  _ctx: ExecutionContext,
): Promise<void> {
  const fromAddr = message.from
  const toAddr = message.to
  const startedAt = Date.now()

  console.log(JSON.stringify({
    event: 'inbound_email_received', from: fromAddr, to: toAddr, size: message.rawSize,
  }))

  try {
    const rawEmail = await new Response(message.raw).arrayBuffer()
    const parsed = await new PostalMime().parse(rawEmail)

    const messageId = parsed.messageId || crypto.randomUUID()
    const subject = parsed.subject || '(no subject)'
    const bodyText = (parsed.text || parsed.html || '').slice(0, 50_000)

    // Forwarded-email detection: subject starts with "Fwd:" / "Fw:" /
    // "Forwarded:", or body contains "From:" headers / a divider line.
    const isForwarded =
      /^(fwd|fw|forwarded):/i.test(subject) ||
      /[-]+\s*Original message\s*[-]+/i.test(bodyText) ||
      /^From:\s/m.test(bodyText)

    let originalSender: string | undefined
    if (isForwarded) {
      const m = bodyText.match(/From:\s*[^<\n]*<([^>]+)>/i)
        ?? bodyText.match(/From:\s*([^\s<>]+@[^\s<>]+)/i)
      originalSender = m?.[1]
    }

    const db = drizzle(env.DB)

    // Match the sender (or original forwarder) to an existing contact.
    // Adapt the lookup to whatever shape your contact entities use.
    let contactId: string | undefined
    const senderEmail = originalSender ?? fromAddr
    const allContacts = await db
      .select({ id: entities.id, fields: entities.fields })
      .from(entities)
      .where(eq(entities.type, 'contact'))
      .limit(2000)
    const match = allContacts.find((c) => {
      try {
        const f = JSON.parse(c.fields ?? '{}') as Record<string, unknown>
        return (f['email'] as string | undefined)?.toLowerCase() === senderEmail.toLowerCase()
      } catch { return false }
    })
    if (match) contactId = match.id

    // Insert pending row — the triage routine picks it up on its next fire.
    const inboundId = crypto.randomUUID()
    await db.insert(inboundEmails).values({
      id: inboundId,
      messageId,
      fromEmail: parsed.from?.address ?? fromAddr,
      fromName: parsed.from?.name ?? null,
      toEmail: toAddr,
      subject,
      bodyText,
      forwardedBy: isForwarded ? (parsed.from?.address ?? fromAddr) : null,
      originalSender: originalSender ?? null,
      attachmentCount: parsed.attachments?.length ?? 0,
      status: 'pending',
      contactId: contactId ?? null,
    })

    // Persist PDF attachments to R2 and create files rows.
    // Filter on mimeType / extension to avoid storing every signature image.
    for (const att of parsed.attachments ?? []) {
      if (!att.mimeType?.includes('pdf') && !att.filename?.toLowerCase().endsWith('.pdf')) continue
      const filename = att.filename || `attachment-${crypto.randomUUID()}.pdf`
      const fileId = crypto.randomUUID()
      const r2Key = `inbound/${inboundId}/${fileId}-${filename}`
      const raw = att.content
      const bytes: Uint8Array =
        typeof raw === 'string' ? new TextEncoder().encode(raw)
        : raw instanceof ArrayBuffer ? new Uint8Array(raw)
        : (raw as Uint8Array)

      await env.FILES.put(r2Key, bytes, {
        httpMetadata: { contentType: att.mimeType || 'application/pdf' },
      })

      await db.insert(files).values({
        id: fileId,
        userId: contactId ?? 'system',  // adapt to your tenancy model
        name: filename,
        key: r2Key,
        mimeType: att.mimeType || 'application/pdf',
        size: bytes.byteLength,
        folder: '/inbound',
      })

      console.log(JSON.stringify({
        event: 'inbound_attachment_stored', inboundId, fileId, filename, size: bytes.byteLength,
      }))
    }

    console.log(JSON.stringify({
      event: 'inbound_email_complete',
      inboundId,
      contactId: contactId ?? null,
      attachments: parsed.attachments?.length ?? 0,
      durationMs: Date.now() - startedAt,
    }))
  } catch (err) {
    // Log + drop. Don't throw — Cloudflare Email Routing retries
    // indefinitely on uncaught errors.
    console.error(JSON.stringify({
      event: 'inbound_email_error', from: fromAddr, to: toAddr, error: String(err),
    }))
  }
}
```

Install postal-mime once: `pnpm add postal-mime`.

---

## 4. Failure modes

| Failure | Behaviour | Recovery |
|---|---|---|
| postal-mime parse error | Caught by try/catch, logged as `inbound_email_error`, dropped | Sender resends or you replay from raw email |
| R2 unreachable on attachment put | Caught, logged, dropped | Same as above; attachment is lost unless raw is kept |
| D1 insert fails | Caught, logged, dropped | Manual replay from raw email; consider retrying inline once |
| Multiple attachments, one fails partway | Partial state — earlier attachments stored, row may not insert | Add a `processed_attachments` counter and reconcile in the triage routine |
| Spammy/automated email floods the table | Rows pile up at `status=pending` | Add a sender-domain allowlist before inserting; the triage routine can also tag-and-skip noise |

The principle: **log + continue, never throw**. Cloudflare retries the
whole message on an uncaught error, so a transient D1 hiccup becomes a
duplicate-insert problem on retry. Mark the row `status=error` if you
want the routine to retry the soft work; drop it entirely if you'd
rather not store junk.

---

## 5. Latency note

Target the handler at < 1s end-to-end. Three D1 writes + an R2 put per
attachment fits comfortably in budget on a cold start. If you find the
handler approaching the Worker request budget (e.g. 10+ attachments,
slow R2 region), push parsing into a Cloudflare Queue:

```typescript
async email(message, env, ctx) {
  const raw = await new Response(message.raw).arrayBuffer()
  await env.INBOUND_QUEUE.send({
    raw: Array.from(new Uint8Array(raw)),
    from: message.from,
    to: message.to,
  })
}
```

A Queue consumer then does the parse + persist work without holding
the email handler open. Add the Queue binding to `wrangler.jsonc` and
mark the consumer Worker, same pattern as
[`docs/ADDING_BACKGROUND_JOBS.md`](./ADDING_BACKGROUND_JOBS.md).

---

## 6. Wire a triage routine

Once rows are landing in `inbound_emails` with `status=pending`,
create a routine that picks them up. See
[`ROUTINES.md`](./ROUTINES.md) → "Worked Example — Email Triage
Routine" for the canonical shape:

- `triggerKind: 'schedule'`, `baseInterval: 30 * 60` (every 30 min)
- `inputText` instructs the agent to query `inbound_emails` where
  `status=pending`, run a domain extraction tool per attachment,
  emit findings via `inbox_add`, mark complete.
- `toolsAllowed`: your domain's extraction tool + `inbox_add` +
  `find_tools`.

The routine surface gives the work observability (cost / steps / runs
per fire) and a tidy "edit cadence in the UI" affordance — better
than firing the analyser inline from the email handler.

---

## Worked example

Rightcover (private Jezweb fork) ships this exact pattern for
`inbox@rightcover.au` — Michael forwards a CBN INSIGHT invoice, the
handler stores the PDF and an `inbound_emails` row, and the
`inbound-triage` routine wakes every 30 minutes to run `analyse_policy`
on each attachment and emit a finding. Source:
`src/server/modules/insurance/lib/email-handler.ts`.

---

**Last updated**: 2026-05-04
