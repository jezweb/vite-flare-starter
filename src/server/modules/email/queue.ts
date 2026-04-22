/**
 * Email queue consumer — optional async send path.
 *
 * Enable by:
 *   1. Uncommenting the queues block in wrangler.jsonc
 *   2. Setting EMAIL_ASYNC=true in .dev.vars / wrangler vars
 *   3. Wiring the exported `queue()` handler into src/server/index.ts
 *
 * Until then, sendEmail() sends synchronously. This file stays in the repo
 * as a reference pattern — forks that want async/retry behaviour can wire
 * it up without re-inventing.
 */
import { sendEmail, type EmailEnv, type SendEmailInput } from './service'

export interface EmailQueueEnv extends EmailEnv {
  EMAIL_QUEUE?: {
    send: (msg: SendEmailInput) => Promise<void>
  }
  EMAIL_ASYNC?: string
}

/**
 * Enqueue an email for async delivery. Falls back to direct send when the
 * queue binding isn't present or EMAIL_ASYNC isn't 'true'.
 */
export async function queueEmail<K extends SendEmailInput>(
  env: EmailQueueEnv,
  input: K,
): Promise<{ queued: boolean; result?: Awaited<ReturnType<typeof sendEmail>> }> {
  if (env.EMAIL_ASYNC === 'true' && env.EMAIL_QUEUE) {
    await env.EMAIL_QUEUE.send(input)
    return { queued: true }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await sendEmail(env, input as any)
  return { queued: false, result }
}

/**
 * Queue handler — hook into wrangler's queue consumer:
 *
 *   // src/server/index.ts
 *   export default {
 *     fetch: app.fetch,
 *     scheduled: ...,
 *     queue: emailQueueHandler,
 *   }
 *
 * Errors trigger `msg.retry()` with exponential backoff up to 5 attempts.
 */
export async function emailQueueHandler(
  batch: MessageBatch<SendEmailInput>,
  env: EmailEnv,
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sendEmail(env, msg.body as any)
      if (result.status === 'failed') {
        const delay = Math.min(60 * 60, 30 * Math.pow(2, msg.attempts ?? 0))
        msg.retry({ delaySeconds: delay })
      } else {
        msg.ack()
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'email_queue_handler_error',
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      msg.retry({ delaySeconds: 60 })
    }
  }
}
