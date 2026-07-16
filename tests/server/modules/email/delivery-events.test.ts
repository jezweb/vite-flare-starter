/**
 * Email delivery events + suppression list (#107).
 *
 * Covers:
 *   - parseEmailEvent: envelope parsing per the documented shapes
 *     (delivered / bounced / complained), rejection of foreign or
 *     malformed messages
 *   - recordDeliveryEvent: event insert idempotency (eventId), bounce/
 *     complaint → suppression upsert, suppression idempotency (email)
 *   - filterSuppressed: split + case-insensitivity + fail-open
 *   - sendEmail: EMAIL_SUPPRESSION_ENFORCE send-path skip (typed
 *     'suppressed' result), default-off behaviour
 *
 * Tables are created via raw SQL mirroring the Drizzle schema
 * (20260716105411_email_delivery_events.sql), following the repo's
 * test convention (see routines/org-scoping.test.ts).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import {
  parseEmailEvent,
  recordDeliveryEvent,
  filterSuppressed,
  emailDeliveryEventsHandler,
} from '@/server/modules/email/delivery-events'
import { sendEmail } from '@/server/modules/email/service'

async function runSql(sql: string, params: unknown[] = []): Promise<void> {
  const stmt = env.DB.prepare(sql)
  await (params.length > 0 ? stmt.bind(...params).run() : stmt.run())
}

async function ensureSchema(): Promise<void> {
  await runSql(`CREATE TABLE IF NOT EXISTS email_events (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    event_type TEXT NOT NULL,
    terminal INTEGER NOT NULL DEFAULT 0,
    smtp_status_code TEXT,
    smtp_response TEXT,
    bounce_type TEXT,
    bounce_classification TEXT,
    domain TEXT,
    raw_payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`)
  await runSql(
    `CREATE UNIQUE INDEX IF NOT EXISTS email_events_event_id_idx ON email_events (event_id)`
  )
  await runSql(`CREATE TABLE IF NOT EXISTS email_suppressions (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    reason TEXT NOT NULL,
    source_event_id TEXT,
    created_at INTEGER NOT NULL
  )`)
  await runSql(
    `CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_email_idx ON email_suppressions (email)`
  )
  // sendEmail logs every attempt — the console provider path needs this.
  await runSql(`CREATE TABLE IF NOT EXISTS email_log (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    to_address TEXT NOT NULL,
    from_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    template TEXT,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    message_id TEXT,
    error TEXT,
    tags TEXT,
    sent_at INTEGER NOT NULL
  )`)
}

async function clearTables(): Promise<void> {
  await runSql('DELETE FROM email_events')
  await runSql('DELETE FROM email_suppressions')
  await runSql('DELETE FROM email_log')
}

const dbEnv = () => env as unknown as { DB: D1Database }

/** Envelope builder matching the documented Queues event-subscription shape. */
function makeEnvelope(
  eventType: string,
  overrides: {
    eventId?: string
    recipient?: string
    messageId?: string
    bounce?: { type: string; classification: string; reason: string }
  } = {}
) {
  return {
    type: `cf.email.sending.message.${eventType}`,
    source: {
      type: 'email.sending',
      zoneId: '023e105f4ecef8ad9ca31a8372d0c353',
      domain: 'send.example.com',
    },
    payload: {
      eventId: overrides.eventId ?? crypto.randomUUID(),
      messageId: overrides.messageId ?? '0101018f7d0c4d9a-msg-test',
      sender: 'noreply@send.example.com',
      recipient: overrides.recipient ?? 'user@example.net',
      subject: 'Welcome',
      terminal: eventType !== 'deferred',
      delivery: {
        status: eventType,
        provider: 'external_smtp',
        deliveryTimeMs: 1234,
        smtpStatusCode: eventType === 'delivered' ? '250' : '550',
        smtpEnhancedStatusCode: eventType === 'delivered' ? '2.0.0' : '5.1.1',
        smtpResponse:
          eventType === 'delivered' ? '250 2.0.0 OK' : '550 5.1.1 User unknown',
      },
      ...(overrides.bounce ? { bounce: overrides.bounce } : {}),
    },
    metadata: {
      accountId: 'f9f79265f388666de8122cfb508d7776',
      eventSubscriptionId: '1830c4bb612e43c3af7f4cada31fbf3f',
      eventSchemaVersion: 1,
      eventTimestamp: '2026-07-16T02:48:57.132Z',
    },
  }
}

describe('parseEmailEvent', () => {
  it('parses a delivered event with SMTP details', () => {
    const parsed = parseEmailEvent(makeEnvelope('delivered', { eventId: 'ev-1' }))
    expect(parsed).toMatchObject({
      eventId: 'ev-1',
      messageId: '0101018f7d0c4d9a-msg-test',
      recipient: 'user@example.net',
      eventType: 'delivered',
      terminal: true,
      smtpStatusCode: '250',
      smtpResponse: '250 2.0.0 OK',
      domain: 'send.example.com',
    })
  })

  it('parses a bounced event with bounce classification', () => {
    const parsed = parseEmailEvent(
      makeEnvelope('bounced', {
        bounce: { type: 'hard', classification: 'permanent_failure', reason: '550 5.1.1' },
      })
    )
    expect(parsed?.eventType).toBe('bounced')
    expect(parsed?.bounceType).toBe('hard')
    expect(parsed?.bounceClassification).toBe('permanent_failure')
  })

  it('lowercases the recipient', () => {
    const parsed = parseEmailEvent(makeEnvelope('delivered', { recipient: 'User@Example.NET' }))
    expect(parsed?.recipient).toBe('user@example.net')
  })

  it('rejects non-email event types (foreign subscription on the same queue)', () => {
    expect(parseEmailEvent({ type: 'cf.r2.object.created', payload: {} })).toBeNull()
    expect(parseEmailEvent({ type: 'cf.email.sending.message.unknown-type', payload: {} })).toBeNull()
  })

  it('rejects malformed bodies without throwing', () => {
    expect(parseEmailEvent(null)).toBeNull()
    expect(parseEmailEvent('not json')).toBeNull()
    expect(parseEmailEvent({ type: 'cf.email.sending.message.delivered' })).toBeNull() // no payload
    expect(
      parseEmailEvent({ type: 'cf.email.sending.message.delivered', payload: { messageId: 'x' } })
    ).toBeNull() // no recipient
  })
})

describe('recordDeliveryEvent', () => {
  beforeAll(ensureSchema)
  beforeEach(clearTables)

  it('records a delivered event without suppressing', async () => {
    const parsed = parseEmailEvent(makeEnvelope('delivered'))!
    const result = await recordDeliveryEvent(dbEnv(), parsed)
    expect(result).toEqual({ recorded: true, suppressed: false })

    const events = await env.DB.prepare('SELECT * FROM email_events').all()
    expect(events.results).toHaveLength(1)
    expect(events.results[0]).toMatchObject({
      event_type: 'delivered',
      recipient: 'user@example.net',
      smtp_response: '250 2.0.0 OK',
      domain: 'send.example.com',
    })
    const sups = await env.DB.prepare('SELECT * FROM email_suppressions').all()
    expect(sups.results).toHaveLength(0)
  })

  it('is idempotent on eventId (Queues at-least-once replay)', async () => {
    const parsed = parseEmailEvent(makeEnvelope('bounced', { eventId: 'ev-dup' }))!
    const first = await recordDeliveryEvent(dbEnv(), parsed)
    const second = await recordDeliveryEvent(dbEnv(), parsed)
    expect(first.recorded).toBe(true)
    expect(second).toEqual({ recorded: false, suppressed: false })
    const events = await env.DB.prepare('SELECT * FROM email_events').all()
    expect(events.results).toHaveLength(1)
    // Replay must not have removed the original suppression either.
    const sups = await env.DB.prepare('SELECT * FROM email_suppressions').all()
    expect(sups.results).toHaveLength(1)
  })

  it('bounced event suppresses the recipient with reason=bounce + source event id', async () => {
    const parsed = parseEmailEvent(
      makeEnvelope('bounced', {
        recipient: 'gone@example.net',
        bounce: { type: 'hard', classification: 'permanent_failure', reason: '550' },
      })
    )!
    const result = await recordDeliveryEvent(dbEnv(), parsed)
    expect(result.suppressed).toBe(true)

    const sups = await env.DB.prepare('SELECT * FROM email_suppressions').all()
    expect(sups.results).toHaveLength(1)
    expect(sups.results[0]).toMatchObject({ email: 'gone@example.net', reason: 'bounce' })
    const events = await env.DB.prepare('SELECT id FROM email_events').all()
    expect(sups.results[0]!['source_event_id']).toBe(events.results[0]!['id'])
  })

  it('complained event suppresses with reason=complaint', async () => {
    const parsed = parseEmailEvent(makeEnvelope('complained', { recipient: 'angry@example.net' }))!
    await recordDeliveryEvent(dbEnv(), parsed)
    const sups = await env.DB.prepare('SELECT * FROM email_suppressions').all()
    expect(sups.results[0]).toMatchObject({ email: 'angry@example.net', reason: 'complaint' })
  })

  it('suppression upsert is idempotent per email — first reason wins', async () => {
    await recordDeliveryEvent(
      dbEnv(),
      parseEmailEvent(makeEnvelope('bounced', { recipient: 'both@example.net', eventId: 'ev-a' }))!
    )
    const second = await recordDeliveryEvent(
      dbEnv(),
      parseEmailEvent(
        makeEnvelope('complained', { recipient: 'both@example.net', eventId: 'ev-b' })
      )!
    )
    // Second event still records, but the existing suppression stands.
    expect(second).toEqual({ recorded: true, suppressed: false })
    const sups = await env.DB.prepare('SELECT * FROM email_suppressions').all()
    expect(sups.results).toHaveLength(1)
    expect(sups.results[0]).toMatchObject({ email: 'both@example.net', reason: 'bounce' })
  })
})

describe('emailDeliveryEventsHandler', () => {
  beforeAll(ensureSchema)
  beforeEach(clearTables)

  function makeBatch(bodies: unknown[]) {
    const acked: number[] = []
    const retried: number[] = []
    const batch = {
      queue: 'email-events',
      messages: bodies.map((body, i) => ({
        id: `msg-${i}`,
        timestamp: new Date(),
        attempts: 1,
        body,
        ack: () => acked.push(i),
        retry: () => retried.push(i),
      })),
    } as unknown as MessageBatch<unknown>
    return { batch, acked, retried }
  }

  it('records parseable messages and acks unparseable ones (no retry loop)', async () => {
    const { batch, acked, retried } = makeBatch([
      makeEnvelope('bounced', { recipient: 'b@example.net' }),
      { totally: 'unrelated' },
    ])
    await emailDeliveryEventsHandler(batch, dbEnv())
    expect(acked).toEqual([0, 1])
    expect(retried).toEqual([])
    const events = await env.DB.prepare('SELECT * FROM email_events').all()
    expect(events.results).toHaveLength(1)
  })
})

describe('filterSuppressed', () => {
  beforeAll(ensureSchema)
  beforeEach(clearTables)

  it('splits recipients into allowed + suppressed, case-insensitively', async () => {
    await runSql(
      `INSERT INTO email_suppressions (id, email, reason, created_at) VALUES ('s1', 'blocked@example.net', 'bounce', 0)`
    )
    const result = await filterSuppressed(dbEnv(), ['Blocked@Example.NET', 'fine@example.net'])
    expect(result.suppressed).toEqual(['Blocked@Example.NET'])
    expect(result.allowed).toEqual(['fine@example.net'])
  })

  it('fails open when the table is unreachable', async () => {
    const reject = () => Promise.reject(new Error('boom'))
    const stmt = { all: reject, raw: reject, run: reject, first: reject, bind: () => stmt }
    const broken = { DB: { prepare: () => stmt } } as unknown as { DB: D1Database }
    const result = await filterSuppressed(broken, ['a@example.net'])
    expect(result.allowed).toEqual(['a@example.net'])
    expect(result.suppressed).toEqual([])
  })
})

describe('sendEmail — suppression enforcement', () => {
  beforeAll(ensureSchema)
  beforeEach(async () => {
    await clearTables()
    await runSql(
      `INSERT INTO email_suppressions (id, email, reason, created_at) VALUES ('s1', 'suppressed@example.net', 'bounce', 0)`
    )
  })

  // No provider bindings/keys → the console provider handles the send,
  // returning status 'skipped'. That distinguishes "send path reached a
  // provider" from the 'suppressed' early exit.
  const sendEnv = (enforce: boolean) =>
    ({
      DB: env.DB,
      ...(enforce ? { EMAIL_SUPPRESSION_ENFORCE: 'true' } : {}),
    }) as unknown as Parameters<typeof sendEmail>[0]

  it('returns typed suppressed result when the only recipient is suppressed', async () => {
    const result = await sendEmail(sendEnv(true), {
      to: 'suppressed@example.net',
      subject: 'Hello',
      html: '<p>Hi</p>',
    })
    expect(result.status).toBe('suppressed')
    expect(result.error).toContain('suppressed@example.net')

    const log = await env.DB.prepare('SELECT status FROM email_log').all()
    expect(log.results[0]).toMatchObject({ status: 'suppressed' })
  })

  it('sends to remaining recipients when only some are suppressed', async () => {
    const result = await sendEmail(sendEnv(true), {
      to: ['suppressed@example.net', 'fine@example.net'],
      subject: 'Hello',
      html: '<p>Hi</p>',
    })
    // Console provider "sent" it → skipped, not suppressed.
    expect(result.status).toBe('skipped')
    expect(result.provider).toBe('console')
  })

  it('default off: suppressed recipients still get sends without the flag', async () => {
    const result = await sendEmail(sendEnv(false), {
      to: 'suppressed@example.net',
      subject: 'Hello',
      html: '<p>Hi</p>',
    })
    expect(result.status).toBe('skipped')
  })
})
