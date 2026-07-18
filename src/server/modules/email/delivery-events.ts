/**
 * Email delivery-events queue consumer — optional bounce/complaint feedback loop.
 *
 * Cloudflare Email Sending publishes six lifecycle events per message via
 * Queues event subscriptions (live since 2026-07-15):
 *
 *   message.delivered   — recipient mail server accepted the message
 *   message.deferred    — temporary failure, retries still pending
 *   message.bounced     — permanent bounce OR soft-bounce retries exhausted
 *   message.failed      — internal / non-SMTP delivery error
 *   message.rejected    — rejected pre-delivery (policy/suppression/spam)
 *   message.complained  — recipient marked it as spam (feedback loop)
 *
 * ⚠ email-service provider only. Events fire for messages sent through the
 * Cloudflare Email Service binding (`env.EMAIL`) from a subscribed sending
 * domain. The other five providers (smtp2go, mailgun, resend, …) have their
 * own webhook systems and never feed this consumer.
 *
 * Enable by:
 *   1. `wrangler queues create email-events`
 *   2. Create the event subscription — one per sending domain — in the
 *      dashboard (Queues → email-events → Subscriptions → Email Sending) or
 *      via `wrangler queues subscription create email-events --source ... --events ...`.
 *      Docs: https://developers.cloudflare.com/email-service/platform/event-subscriptions/
 *   3. Uncommenting the queues consumer block in wrangler.jsonc
 *   4. Wiring the exported handler into src/server/index.ts:
 *
 *        // src/server/index.ts
 *        import { emailDeliveryEventsHandler } from './modules/email/delivery-events'
 *        export default {
 *          fetch: ...,
 *          scheduled: ...,
 *          queue: emailDeliveryEventsHandler,
 *        }
 *
 *      If you also enabled the async-send consumer (queue.ts), dispatch on
 *      `batch.queue` — one Worker `queue()` export serves every consumer:
 *
 *        async queue(batch, env) {
 *          if (batch.queue === 'email-events') return emailDeliveryEventsHandler(batch, env)
 *          return emailQueueHandler(batch as MessageBatch<SendEmailInput>, env)
 *        }
 *
 *   5. Optional: set EMAIL_SUPPRESSION_ENFORCE='true' so sendEmail() skips
 *      suppressed recipients (see service.ts).
 *
 * Until then, this file stays in the repo as a reference pattern — forks
 * that want post-acceptance delivery feedback can wire it up without
 * re-inventing.
 *
 * What it does per event:
 *   - Records a row in `email_events` (idempotent on Cloudflare's eventId —
 *     Queues delivers at-least-once, so replays are dropped).
 *   - On bounced/complained, upserts the recipient into `email_suppressions`
 *     so future sends can be blocked. Both hard bounces and exhausted soft
 *     retries arrive as message.bounced; forks that only want to suppress
 *     hard bounces can gate on `parsed.bounceType === 'hard'` in
 *     recordDeliveryEvent.
 */
import { drizzle } from 'drizzle-orm/d1'
import { inArray } from 'drizzle-orm'
import { emailEvents, emailSuppressions } from './db/schema'

/** The consumer only needs the database. */
export interface EmailDeliveryEventsEnv {
  DB: D1Database
}

export type EmailEventType =
  | 'delivered'
  | 'deferred'
  | 'bounced'
  | 'failed'
  | 'rejected'
  | 'complained'

const EVENT_TYPE_PREFIX = 'cf.email.sending.message.'
const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'delivered',
  'deferred',
  'bounced',
  'failed',
  'rejected',
  'complained',
])

/**
 * The envelope Queues delivers for every event subscription (all sources
 * share this shape; `payload` is source-specific). Verified against
 * https://developers.cloudflare.com/queues/event-subscriptions/events-schemas/
 * on 2026-07-16.
 */
export interface EmailEventEnvelope {
  /** e.g. 'cf.email.sending.message.bounced' */
  type: string
  source?: { type?: string; zoneId?: string; domain?: string }
  payload?: {
    eventId?: string
    messageId?: string
    sender?: string
    recipient?: string
    subject?: string
    /** True when the message reached a final state. */
    terminal?: boolean
    delivery?: {
      status?: string
      provider?: string
      deliveryTimeMs?: number
      smtpStatusCode?: string
      smtpEnhancedStatusCode?: string
      smtpResponse?: string
    }
    /** Present on deferred/bounced events. */
    bounce?: { type?: 'soft' | 'hard'; classification?: string; reason?: string }
    /** Present on failed events. */
    failure?: { reason?: string }
    /** Present on rejected events. */
    rejection?: { reason?: string; party?: string; detail?: string }
    /** Present on complained events. */
    complaint?: { type?: string }
  }
  metadata?: {
    accountId?: string
    eventSubscriptionId?: string
    eventSchemaVersion?: number
    eventTimestamp?: string
  }
}

export interface ParsedEmailEvent {
  eventId: string
  messageId: string
  recipient: string
  eventType: EmailEventType
  terminal: boolean
  smtpStatusCode?: string
  smtpResponse?: string
  bounceType?: string
  bounceClassification?: string
  domain?: string
  rawPayload: string
}

/**
 * Parse a queue message body into a normalised event, or null when the
 * body isn't an Email Sending event (wrong source, unknown type, or
 * missing the fields we key on). Null means "ack and drop" — retrying a
 * malformed message can never succeed.
 */
export function parseEmailEvent(body: unknown): ParsedEmailEvent | null {
  if (typeof body !== 'object' || body === null) return null
  const envelope = body as EmailEventEnvelope
  if (typeof envelope.type !== 'string' || !envelope.type.startsWith(EVENT_TYPE_PREFIX)) {
    return null
  }
  // Trust the source, not just the type string: a forged message from any
  // other producer on the same queue must not be able to suppress an
  // arbitrary recipient (adversarial review 2026-07-16, L3). Subscription
  // envelopes always carry source.type = "email.sending".
  if (envelope.source?.type !== 'email.sending') return null
  const eventType = envelope.type.slice(EVENT_TYPE_PREFIX.length)
  if (!KNOWN_EVENT_TYPES.has(eventType)) return null

  const p = envelope.payload
  if (!p?.recipient || !p.messageId) return null

  return {
    // eventId is the dedupe key; synthesise one if a build omits it so
    // the row still inserts (no dedupe possible in that case).
    eventId: p.eventId ?? crypto.randomUUID(),
    messageId: p.messageId,
    recipient: p.recipient.toLowerCase(),
    eventType: eventType as EmailEventType,
    terminal: p.terminal === true,
    smtpStatusCode: p.delivery?.smtpStatusCode,
    smtpResponse: p.delivery?.smtpResponse,
    bounceType: p.bounce?.type,
    bounceClassification: p.bounce?.classification,
    domain: envelope.source?.domain,
    rawPayload: JSON.stringify(body),
  }
}

/**
 * Record one parsed event: insert into email_events (idempotent on
 * eventId) and, for bounced/complained, upsert the recipient into
 * email_suppressions (idempotent on email — first suppression wins).
 */
export async function recordDeliveryEvent(
  env: EmailDeliveryEventsEnv,
  parsed: ParsedEmailEvent
): Promise<{ recorded: boolean; suppressed: boolean }> {
  const db = drizzle(env.DB)

  const inserted = await db
    .insert(emailEvents)
    .values({
      eventId: parsed.eventId,
      messageId: parsed.messageId,
      recipient: parsed.recipient,
      eventType: parsed.eventType,
      terminal: parsed.terminal,
      smtpStatusCode: parsed.smtpStatusCode ?? null,
      smtpResponse: parsed.smtpResponse ?? null,
      bounceType: parsed.bounceType ?? null,
      bounceClassification: parsed.bounceClassification ?? null,
      domain: parsed.domain ?? null,
      rawPayload: parsed.rawPayload,
    })
    .onConflictDoNothing({ target: emailEvents.eventId })
    .returning({ id: emailEvents.id })
  const eventRow = inserted[0]

  // Duplicate delivery of an already-recorded event — nothing more to do.
  // (The suppression from the first delivery is already in place.)
  if (!eventRow) return { recorded: false, suppressed: false }

  if (parsed.eventType !== 'bounced' && parsed.eventType !== 'complained') {
    return { recorded: true, suppressed: false }
  }

  const suppression = await db
    .insert(emailSuppressions)
    .values({
      email: parsed.recipient,
      reason: parsed.eventType === 'complained' ? 'complaint' : 'bounce',
      sourceEventId: eventRow.id,
    })
    .onConflictDoNothing({ target: emailSuppressions.email })
    .returning({ id: emailSuppressions.id })

  return { recorded: true, suppressed: suppression.length > 0 }
}

/**
 * Check a recipient list against the suppression list. Used by
 * sendEmail() when EMAIL_SUPPRESSION_ENFORCE='true'. Fails open — a
 * lookup error returns everything as allowed, so a broken suppression
 * table can never block password resets.
 */
export async function filterSuppressed(
  env: EmailDeliveryEventsEnv,
  recipients: string[]
): Promise<{ allowed: string[]; suppressed: string[] }> {
  if (recipients.length === 0) return { allowed: [], suppressed: [] }
  try {
    const db = drizzle(env.DB)
    const rows = await db
      .select({ email: emailSuppressions.email })
      .from(emailSuppressions)
      .where(
        inArray(
          emailSuppressions.email,
          recipients.map((r) => r.toLowerCase())
        )
      )
    const suppressedSet = new Set(rows.map((r) => r.email))
    return {
      allowed: recipients.filter((r) => !suppressedSet.has(r.toLowerCase())),
      suppressed: recipients.filter((r) => suppressedSet.has(r.toLowerCase())),
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'email_suppression_lookup_failed',
        error: err instanceof Error ? err.message : String(err),
      })
    )
    return { allowed: recipients, suppressed: [] }
  }
}

/**
 * Queue handler — see the module docstring for wiring. Malformed or
 * non-email messages are acked (retrying can't fix them); D1 errors
 * retry with a flat 60s delay, matching queue.ts's convention.
 */
export async function emailDeliveryEventsHandler(
  batch: MessageBatch<unknown>,
  env: EmailDeliveryEventsEnv
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      const parsed = parseEmailEvent(msg.body)
      if (!parsed) {
        console.warn(JSON.stringify({ event: 'email_delivery_event_unparseable' }))
        msg.ack()
        continue
      }
      await recordDeliveryEvent(env, parsed)
      msg.ack()
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'email_delivery_event_error',
          error: err instanceof Error ? err.message : String(err),
        })
      )
      msg.retry({ delaySeconds: 60 })
    }
  }
}
