# Email Delivery Events + Suppression List

Close the outbound-email feedback loop: Cloudflare Email Sending →
Queues event subscription → Worker queue consumer → `email_events` log
+ `email_suppressions` bounce list → optional send-path enforcement.

**Time estimate**: 20 mins (queue + subscription + uncomment two blocks).

**Applies to the `email-service` provider only.** Events fire for
messages sent through the Cloudflare Email Service binding
(`env.EMAIL`) from a subscribed sending domain. SMTP2Go, Mailgun and
Resend have their own webhook systems — if your fork sends through
those, wire their webhooks instead (same tables work fine as the
destination).

---

## Why this pattern

`sendEmail()` returning `status: 'sent'` only means the provider
*accepted* the message. Without delivery events you never learn that
the mailbox is full, the address doesn't exist, or the recipient marked
you as spam — and continuing to send to hard-bounced addresses is the
fastest way to destroy a sending domain's reputation.

Cloudflare publishes six lifecycle events per message (live since
2026-07-15), scoped per sending domain:

| Event | Meaning | Terminal? |
|---|---|---|
| `message.delivered` | Recipient mail server accepted it | yes |
| `message.deferred` | Temporary failure, retries pending | no |
| `message.bounced` | Permanent bounce, or soft retries exhausted | yes |
| `message.failed` | Internal / non-SMTP delivery error | yes |
| `message.rejected` | Rejected pre-delivery (policy / suppression / spam) | yes |
| `message.complained` | Recipient marked it as spam (feedback loop) | yes |

```
Email Service sends message            Queue consumer (this module)
  │                                      │
  ▼                                      ▼
recipient mail server responds         parse envelope
  │                                      ├── insert email_events (idempotent on eventId)
  ▼                                      └── bounced/complained →
event subscription → email-events queue        upsert email_suppressions
                                                     │
              sendEmail() with EMAIL_SUPPRESSION_ENFORCE='true'
                └── skips suppressed recipients ◄────┘
```

## The event envelope

Queues wraps every subscription event in the same envelope
(`type` / `source` / `payload` / `metadata`). For Email Sending:

```json
{
  "type": "cf.email.sending.message.bounced",
  "source": { "type": "email.sending", "zoneId": "…", "domain": "send.example.com" },
  "payload": {
    "eventId": "0190d0c4-7ea1-…",          // idempotency key
    "messageId": "0101018f7d0c4d9a-…",     // matches email_log.message_id
    "sender": "receipts@send.example.com",
    "recipient": "user@example.net",
    "subject": "Your receipt",
    "terminal": true,
    "delivery": {
      "status": "bounced",
      "smtpStatusCode": "550",
      "smtpEnhancedStatusCode": "5.1.1",
      "smtpResponse": "550 5.1.1 User unknown"
    },
    "bounce": { "type": "hard", "classification": "permanent_failure", "reason": "550 5.1.1 User unknown" }
  },
  "metadata": { "accountId": "…", "eventSubscriptionId": "…", "eventSchemaVersion": 1, "eventTimestamp": "…" }
}
```

`failed` events carry `failure.reason`, `rejected` events carry
`rejection.{reason,party,detail}`, `complained` events carry
`complaint.type`. Full examples:
[Email Service → Event subscriptions](https://developers.cloudflare.com/email-service/platform/event-subscriptions/).

## 1. Create the queue + subscription

```bash
npx wrangler queues create email-events
npx wrangler queues create email-events-dlq   # dead-letter, optional but recommended
```

Then create the event subscription — **one per sending domain** — in
the dashboard (Queues → email-events → Subscriptions → Email Sending)
or via `wrangler queues subscription create email-events --source … --events …`
(see the [management guide](https://developers.cloudflare.com/queues/event-subscriptions/manage-event-subscriptions/)
for current flags). Select all six `message.*` events.

## 2. Uncomment the consumer block in wrangler.jsonc

Search for "Email delivery events" in `wrangler.jsonc` — the
`queues.consumers` block is ready to uncomment.

## 3. Wire the queue() export

```typescript
// src/server/index.ts
import { emailDeliveryEventsHandler } from './modules/email/delivery-events'

export default {
  async fetch(request, env, ctx) { /* existing routing */ },
  async scheduled(event, env) { /* existing cron handler */ },
  queue: emailDeliveryEventsHandler,
}
```

One Worker gets one `queue()` export — if you also enabled the
async-send consumer (`queue.ts`), dispatch on `batch.queue`. The
`delivery-events.ts` docstring has the combined example.

## 4. Apply the migration

Tables ship in `drizzle/20260716105411_email_delivery_events.sql`:

- **`email_events`** — one row per lifecycle event: message id,
  recipient, event type, SMTP response, bounce classification, sending
  domain, raw envelope JSON. Idempotent on Cloudflare's `eventId`
  (Queues delivers at-least-once).
- **`email_suppressions`** — unique per recipient address, with
  `reason` (`bounce` / `complaint` / `manual`) and the source event id.
  First suppression wins; deleting a row un-suppresses.

```bash
pnpm db:migrate:remote
```

## 5. Opt in to enforcement (recommended once events flow)

```bash
# .dev.vars / wrangler vars
EMAIL_SUPPRESSION_ENFORCE=true
```

Semantics — deliberately conservative:

- **Default off.** Without the flag, events and suppressions accumulate
  but nothing is blocked — you can watch the table before trusting it.
- With the flag, `sendEmail()` checks recipients against
  `email_suppressions`. All recipients suppressed → typed
  `status: 'suppressed'` result (logged to `email_log` with status
  `suppressed`), nothing sent. Some suppressed → the send proceeds to
  the remaining recipients only.
- **Fails open.** A suppression-table lookup error lets the send
  through — a broken table must never block password resets.

Suppression policy: both hard bounces and exhausted-soft-retry bounces
arrive as `message.bounced` and both get suppressed. Forks that only
want to suppress hard bounces can gate on `bounceType === 'hard'` in
`recordDeliveryEvent()`.

## Admin API

All under the existing admin-only email routes:

| Endpoint | Does |
|---|---|
| `GET /api/email/suppressions?reason=&email=&limit=&offset=` | List suppressions |
| `POST /api/email/suppressions` `{ "email": "x@y.com" }` | Manual suppression (idempotent) |
| `DELETE /api/email/suppressions/:email` | Un-suppress |
| `GET /api/email/logs?status=suppressed` | Sends blocked by enforcement |

Suppressions are **app-global** (deliverability belongs to the sending
domain, not a user), so `scopeUser` doesn't apply — admin gating does.

## Key files

| File | Role |
|---|---|
| `src/server/modules/email/delivery-events.ts` | Envelope types, parser, consumer, `filterSuppressed` |
| `src/server/modules/email/db/schema.ts` | `email_events` + `email_suppressions` tables |
| `src/server/modules/email/service.ts` | `EMAIL_SUPPRESSION_ENFORCE` send-path check |
| `src/server/modules/email/routes.ts` | Suppression admin endpoints |
| `tests/server/modules/email/delivery-events.test.ts` | Parser + upsert + send-skip coverage |
