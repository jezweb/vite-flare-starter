# Adding Background Jobs

Guide for implementing async processing with Cloudflare Queues and scheduled tasks with Cron Triggers.

**Time estimate**: 2-3 hours for queues, 1-2 hours for cron

---

## When to Use Background Jobs

**Use Queues when:**
- Processing takes >30 seconds (Worker timeout)
- Need to retry failed operations
- Want to decouple request/response from processing
- Handling webhooks that need async processing

**Use Cron Triggers when:**
- Scheduled tasks (daily reports, cleanup)
- Periodic data sync
- Maintenance tasks

---

## Cloudflare Queues

### 1. Create Queue

```bash
npx wrangler queues create vite-flare-starter-queue
```

### 2. Add Binding

```jsonc
// wrangler.jsonc
{
  "queues": {
    "producers": [
      { "binding": "QUEUE", "queue": "vite-flare-starter-queue" }
    ],
    "consumers": [
      { "queue": "vite-flare-starter-queue", "max_batch_size": 10, "max_retries": 3 }
    ]
  }
}
```

### 3. Update Types

```typescript
// src/server/env.d.ts
interface Env {
  QUEUE: Queue<QueueMessage>
}

// Define your message types
type QueueMessage =
  | { type: 'send-email'; payload: { to: string; subject: string; body: string } }
  | { type: 'process-upload'; payload: { fileId: string; userId: string } }
  | { type: 'sync-external'; payload: { userId: string; service: string } }
  | { type: 'generate-report'; payload: { reportId: string } }
```

---

## Queue Producer (Sending Messages)

```typescript
// src/server/lib/queue.ts
import type { QueueMessage } from './types'

export async function enqueue(queue: Queue<QueueMessage>, message: QueueMessage) {
  await queue.send(message)
}

export async function enqueueBatch(queue: Queue<QueueMessage>, messages: QueueMessage[]) {
  await queue.sendBatch(messages.map(body => ({ body })))
}

// With delay (up to 12 hours)
export async function enqueueDelayed(
  queue: Queue<QueueMessage>,
  message: QueueMessage,
  delaySeconds: number
) {
  await queue.send(message, { delaySeconds })
}
```

### Usage in Routes

```typescript
// src/server/modules/files/routes.ts
app.post('/', async (c) => {
  // ... upload file

  // Queue async processing
  await c.env.QUEUE.send({
    type: 'process-upload',
    payload: { fileId: record.id, userId },
  })

  return c.json({ file: record, processing: true })
})
```

---

## Queue Consumer (Processing Messages)

```typescript
// src/server/queue.ts
import { drizzle } from 'drizzle-orm/d1'
import type { QueueMessage } from './lib/types'

export default {
  async queue(
    batch: MessageBatch<QueueMessage>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const db = drizzle(env.DB)

    for (const message of batch.messages) {
      try {
        await processMessage(message.body, env, db)
        message.ack() // Success - remove from queue
      } catch (error) {
        console.error(`Failed to process message:`, error)
        message.retry() // Failed - retry later
      }
    }
  },
}

async function processMessage(
  message: QueueMessage,
  env: Env,
  db: DrizzleD1Database
) {
  switch (message.type) {
    case 'send-email':
      await handleSendEmail(message.payload, env)
      break

    case 'process-upload':
      await handleProcessUpload(message.payload, env, db)
      break

    case 'sync-external':
      await handleSyncExternal(message.payload, env, db)
      break

    case 'generate-report':
      await handleGenerateReport(message.payload, env, db)
      break

    default:
      console.warn(`Unknown message type:`, message)
  }
}

// Handler implementations
async function handleSendEmail(
  payload: { to: string; subject: string; body: string },
  env: Env
) {
  const { Resend } = await import('resend')
  const resend = new Resend(env.RESEND_API_KEY)

  await resend.emails.send({
    from: 'noreply@yourapp.com',
    to: payload.to,
    subject: payload.subject,
    html: payload.body,
  })
}

async function handleProcessUpload(
  payload: { fileId: string; userId: string },
  env: Env,
  db: DrizzleD1Database
) {
  // Get file from R2
  const file = await db.select().from(files).where(eq(files.id, payload.fileId)).get()
  if (!file) return

  const object = await env.FILES.get(file.key)
  if (!object) return

  // Process (e.g., generate thumbnail, extract metadata)
  // ...

  // Update record
  await db
    .update(files)
    .set({ processed: true, updatedAt: new Date() })
    .where(eq(files.id, payload.fileId))
}

async function handleSyncExternal(
  payload: { userId: string; service: string },
  env: Env,
  db: DrizzleD1Database
) {
  // Sync with external service
  // ...
}

async function handleGenerateReport(
  payload: { reportId: string },
  env: Env,
  db: DrizzleD1Database
) {
  // Generate report, save to R2
  // ...
}
```

### Export Consumer

```typescript
// src/server/index.ts
import queueHandler from './queue'

// ... existing app setup

// Export queue handler
export default {
  fetch: app.fetch,
  queue: queueHandler.queue, // Add this
}
```

---

## Cron Triggers

### 1. Configure Triggers

```jsonc
// wrangler.jsonc
{
  "triggers": {
    "crons": [
      "0 0 * * *",    // Daily at midnight UTC
      "0 */6 * * *",  // Every 6 hours
      "0 9 * * 1"     // Weekly on Monday at 9am UTC
    ]
  }
}
```

### 2. Implement Handler

```typescript
// src/server/scheduled.ts
import { drizzle } from 'drizzle-orm/d1'
import { lt, eq } from 'drizzle-orm'

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const db = drizzle(env.DB)

    // Route based on cron schedule
    switch (event.cron) {
      case '0 0 * * *': // Daily midnight
        await dailyCleanup(db, env)
        break

      case '0 */6 * * *': // Every 6 hours
        await syncExternalData(db, env)
        break

      case '0 9 * * 1': // Weekly Monday
        await weeklyReport(db, env)
        break

      default:
        console.log(`Unknown cron: ${event.cron}`)
    }
  },
}

async function dailyCleanup(db: DrizzleD1Database, env: Env) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Clean up expired sessions
  await db
    .delete(session)
    .where(lt(session.expiresAt, new Date()))

  // Clean up old activity logs
  await db
    .delete(activityLogs)
    .where(lt(activityLogs.createdAt, thirtyDaysAgo))

  // Clean up orphaned files
  const orphanedFiles = await db
    .select()
    .from(files)
    .where(lt(files.createdAt, thirtyDaysAgo))
    .all()

  for (const file of orphanedFiles) {
    await env.FILES.delete(file.key)
    await db.delete(files).where(eq(files.id, file.id))
  }

  console.log(`Daily cleanup complete: removed ${orphanedFiles.length} orphaned files`)
}

async function syncExternalData(db: DrizzleD1Database, env: Env) {
  // Sync with external APIs
  console.log('External sync started')
  // ...
  console.log('External sync complete')
}

async function weeklyReport(db: DrizzleD1Database, env: Env) {
  // Generate and email weekly report
  const stats = await db
    .select({
      totalUsers: sql<number>`COUNT(DISTINCT ${user.id})`,
      newUsers: sql<number>`COUNT(CASE WHEN ${user.createdAt} > datetime('now', '-7 days') THEN 1 END)`,
    })
    .from(user)
    .get()

  // Queue email
  await env.QUEUE.send({
    type: 'send-email',
    payload: {
      to: 'admin@yourapp.com',
      subject: 'Weekly Report',
      body: `
        <h1>Weekly Report</h1>
        <p>Total users: ${stats?.totalUsers}</p>
        <p>New users this week: ${stats?.newUsers}</p>
      `,
    },
  })
}
```

### Export Handler

```typescript
// src/server/index.ts
import scheduledHandler from './scheduled'

export default {
  fetch: app.fetch,
  queue: queueHandler.queue,
  scheduled: scheduledHandler.scheduled, // Add this
}
```

---

## Patterns

### Webhook Processing

Immediately acknowledge webhooks, process async:

```typescript
app.post('/webhook/stripe', async (c) => {
  // Verify signature synchronously
  const event = await verifyStripeSignature(c)

  // Queue for processing
  await c.env.QUEUE.send({
    type: 'stripe-webhook',
    payload: { eventId: event.id, eventType: event.type },
  })

  // Return immediately
  return c.json({ received: true })
})
```

### Batch Processing

For large datasets:

```typescript
async function processBatch(db: DrizzleD1Database, env: Env) {
  const batchSize = 100
  let offset = 0
  let processed = 0

  while (true) {
    const batch = await db
      .select()
      .from(items)
      .where(eq(items.processed, false))
      .limit(batchSize)
      .offset(offset)
      .all()

    if (batch.length === 0) break

    for (const item of batch) {
      await processItem(item)
      processed++
    }

    offset += batchSize
  }

  return processed
}
```

### Retry with Backoff

Queue retries are automatic, but for custom backoff:

```typescript
async function processWithRetry(
  message: MessageBody,
  attempt: number = 0
) {
  const maxAttempts = 3
  const baseDelay = 1000 // 1 second

  try {
    await doWork(message)
  } catch (error) {
    if (attempt >= maxAttempts) {
      throw error // Give up
    }

    const delay = baseDelay * Math.pow(2, attempt) // Exponential backoff
    await new Promise(resolve => setTimeout(resolve, delay))
    return processWithRetry(message, attempt + 1)
  }
}
```

---

## Monitoring

### Queue Metrics

```bash
# View queue status
npx wrangler queues list

# View queue details
npx wrangler queues describe vite-flare-starter-queue
```

### Logging

```typescript
// Add structured logging
console.log(JSON.stringify({
  type: 'queue_processing',
  messageType: message.type,
  timestamp: new Date().toISOString(),
  success: true,
}))
```

### Dead Letter Queue

For messages that fail after all retries:

```jsonc
// wrangler.jsonc
{
  "queues": {
    "consumers": [
      {
        "queue": "vite-flare-starter-queue",
        "max_retries": 3,
        "dead_letter_queue": "vite-flare-starter-dlq"
      }
    ]
  }
}
```

---

## Common Gotchas

### 1. Worker Timeout

Queue consumers have 15 minutes (vs 30 seconds for HTTP). But don't rely on this - chunk large jobs.

### 2. Message Size

Max message size is 128KB. For larger payloads, store in R2 and pass the key.

### 3. Idempotency

Messages may be delivered more than once. Make handlers idempotent:

```typescript
async function handleMessage(payload: { id: string }) {
  // Check if already processed
  const existing = await db
    .select()
    .from(processedMessages)
    .where(eq(processedMessages.id, payload.id))
    .get()

  if (existing) {
    console.log(`Skipping duplicate: ${payload.id}`)
    return
  }

  // Process
  await doWork(payload)

  // Mark as processed
  await db.insert(processedMessages).values({ id: payload.id })
}
```

### 4. Cron Timezone

Cron triggers run in UTC. Adjust your schedules accordingly.

---

## Resources

- [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Queue Message Batching](https://developers.cloudflare.com/queues/configuration/batching-retries/)

---

**Created**: 2026-01-03
**Author**: Jeremy Dawes (Jezweb)
