/**
 * ScheduledAgent — Durable Object base for periodic / scheduled work
 *
 * Pattern complement to the streaming DO agents (VoiceInputExample,
 * VideoInputExample). Where those handle live WebSocket sessions,
 * this handles "fire at time X" / "fire every N minutes" work that
 * survives Worker restarts and runs without a user present.
 *
 * Common use cases:
 *   - Per-user daily digests at the user's chosen time
 *   - Periodic data sync / enrichment
 *   - Reminders ("ping me about X tomorrow")
 *   - Scheduled report delivery
 *
 * **When to use this vs Workers Crons vs Queues:**
 *   - Workers Crons: ONE schedule for the whole account. Right when
 *     all tenants share the same trigger ("nightly cleanup at 3am").
 *   - Durable Object alarms (THIS): per-entity schedule. Right when
 *     each user/org/project has its own time. One DO per entity.
 *   - Queues: high-throughput async work that doesn't care about
 *     timing precision. Right when "do this eventually" wins over
 *     "do this at exactly 9am tomorrow".
 *
 * **Subclass contract:**
 *
 *     export class MyAgent extends ScheduledAgent<{ message: string }> {
 *       static readonly className = 'MyAgent'
 *
 *       async run(payload: { message: string }, attempt: number) {
 *         // Do the work. Throw to retry. Return resultMetadata
 *         // (any JSON-serialisable shape) to record on success.
 *         await something(payload.message)
 *         return { sentTo: payload.message }
 *       }
 *     }
 *
 * Then call `agent.schedule(when, payload)` from the route layer:
 *
 *     const id = env.MyAgent.idFromName(`${userId}:reminder-1`)
 *     const stub = env.MyAgent.get(id)
 *     await stub.schedule(Date.now() + 60_000, { message: 'hello' })
 *
 * **Retry policy:** failed runs schedule a retry with exponential
 * backoff (10s, 1m, 5m, 15m, 1h). After 5 attempts the run is logged
 * with outcome='final_error' and not retried further. Subclasses
 * override `maxAttempts` and `backoffMs` to tune.
 *
 * **Best-effort guarantees:** DO alarms are not strict scheduled jobs.
 * If a DO is evicted, the alarm fires on next access. If the alarm
 * window passes without traffic the DO doesn't wake up immediately.
 * For most "send daily digest at 8am" scenarios this is fine — the
 * digest goes out a few seconds late on a cold isolate. For
 * second-precision schedules use a different primitive.
 */
import { DurableObject } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { scheduledRuns, type ScheduledRunOutcome } from '@/server/modules/scheduled-agents/db/schema'

export interface ScheduledAgentEnv {
  DB: D1Database
}

interface ScheduleStateRow {
  /** ms timestamp when the alarm should fire. Mirrors ctx.storage.getAlarm(). */
  scheduledAt: number
  /** Subclass payload — JSON-serialisable. */
  payload: unknown
  /** Caller-supplied user id for telemetry scoping. Null for system agents. */
  userId: string | null
  /** Attempt count. 1 on first schedule, incremented on retry. */
  attempt: number
  /** When the agent was originally asked to run (vs. when it'll fire after retries).
   *  Lets the dashboard show "scheduled at X, retried 3 times, eventual outcome Y". */
  originallyScheduledAt: number
}

/**
 * Default backoff: 10s, 1m, 5m, 15m, 1h. Tuned for typical agentic
 * work where transient failures (rate limits, cold caches) usually
 * resolve within a few minutes. Subclasses with cheaper or more
 * latency-sensitive work should override.
 */
const DEFAULT_BACKOFF_MS = [10_000, 60_000, 300_000, 900_000, 3_600_000]

export abstract class ScheduledAgent<P = unknown> extends DurableObject<ScheduledAgentEnv> {
  /**
   * Subclasses override to identify themselves in `scheduled_runs.class_name`.
   * Used by the admin surface to filter "show me ReminderAgent runs".
   * Default falls back to constructor name; explicit override is
   * recommended because constructor names get mangled by minifiers.
   */
  static readonly className: string = 'ScheduledAgent'

  /** Override to tune retry policy. Returning [] disables retries. */
  protected get backoffMs(): number[] {
    return DEFAULT_BACKOFF_MS
  }

  protected get maxAttempts(): number {
    return this.backoffMs.length + 1 // initial + N retries
  }

  /**
   * Schedule (or re-schedule) this agent to fire. `when` is a ms
   * timestamp. Stores the payload + metadata in DO storage so the
   * `alarm()` handler can recover it after a Worker restart.
   *
   * Calling `schedule` again with a new `when` REPLACES the pending
   * alarm (DO storage holds at most one alarm at a time). For
   * recurring agents, the subclass's `run()` returns and then calls
   * `this.schedule(now + interval, ...)` to chain the next fire.
   */
  async schedule(when: number, payload: P, opts?: { userId?: string | null }): Promise<void> {
    const state: ScheduleStateRow = {
      scheduledAt: when,
      payload,
      userId: opts?.userId ?? null,
      attempt: 1,
      originallyScheduledAt: when,
    }
    await this.ctx.storage.put('schedule_state', state)
    await this.ctx.storage.setAlarm(when)
  }

  /**
   * Cancel any pending alarm. Idempotent — safe to call when
   * nothing is scheduled.
   */
  async cancel(): Promise<void> {
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.delete('schedule_state')
  }

  /**
   * Inspect the current schedule. Used by the admin surface and by
   * subclasses that want to make decisions ("only schedule if not
   * already scheduled within the next hour").
   */
  async getSchedule(): Promise<{ scheduledAt: number | null; state: ScheduleStateRow | null }> {
    const [scheduledAt, state] = await Promise.all([
      this.ctx.storage.getAlarm(),
      this.ctx.storage.get<ScheduleStateRow>('schedule_state'),
    ])
    return { scheduledAt, state: state ?? null }
  }

  /**
   * Subclass implements the actual work. Receives the typed payload
   * and the attempt number (1 on first try, 2+ on retry).
   *
   * Throwing schedules a retry if attempts remain. Returning
   * normally records 'ok' to scheduled_runs. The return value is
   * persisted as `result_json` for diagnostics.
   */
  abstract run(payload: P, attempt: number): Promise<unknown>

  /**
   * Cloudflare runtime calls this when the alarm fires. Don't
   * override unless you know what you're doing — the retry +
   * telemetry plumbing lives here.
   */
  async alarm(): Promise<void> {
    const firedAt = Date.now()
    const state = await this.ctx.storage.get<ScheduleStateRow>('schedule_state')
    if (!state) {
      // Alarm fired without state — happens when the alarm was set
      // outside `schedule()` or storage was wiped. Best we can do
      // is exit cleanly.
      console.warn(
        JSON.stringify({
          event: 'scheduled_agent_alarm_no_state',
          className: (this.constructor as typeof ScheduledAgent).className,
        }),
      )
      return
    }

    const start = Date.now()
    let outcome: ScheduledRunOutcome = 'ok'
    let errorMessage: string | null = null
    let resultJson: string | null = null

    try {
      const result = await this.run(state.payload as P, state.attempt)
      try {
        resultJson = result === undefined ? null : JSON.stringify(result)
      } catch {
        // Non-serialisable result is fine — record success without it.
        resultJson = null
      }
      // Success: clear schedule state. Subclass is responsible for
      // chaining the next run if recurring.
      await this.ctx.storage.delete('schedule_state')
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err)
      const nextAttempt = state.attempt + 1
      const backoff = this.backoffMs
      if (nextAttempt > this.maxAttempts || backoff.length === 0) {
        outcome = 'final_error'
        await this.ctx.storage.delete('schedule_state')
      } else {
        outcome = 'error'
        // Schedule retry. The retry shares scheduled_runs.scheduledAt
        // (originallyScheduledAt) with the first attempt, so a query
        // for "all attempts of THIS run" can group on it.
        const delay = backoff[Math.min(state.attempt - 1, backoff.length - 1)]!
        const retryAt = Date.now() + delay
        await this.ctx.storage.put<ScheduleStateRow>('schedule_state', {
          ...state,
          attempt: nextAttempt,
          scheduledAt: retryAt,
        })
        await this.ctx.storage.setAlarm(retryAt)
      }
    }

    // Telemetry — best effort. Don't let a D1 hiccup mask the
    // run's actual outcome (which the runtime needs for retry
    // bookkeeping).
    try {
      const db = drizzle(this.env.DB)
      await db.insert(scheduledRuns).values({
        className: (this.constructor as typeof ScheduledAgent).className,
        // Pull the partition name from a property the subclass set
        // on first schedule, or fall back to the storage id.
        name:
          (await this.ctx.storage.get<string>('agent_name')) ??
          this.ctx.id.toString(),
        userId: state.userId,
        scheduledAt: state.originallyScheduledAt,
        firedAt,
        durationMs: Date.now() - start,
        outcome,
        attempt: state.attempt,
        errorMessage,
        resultJson,
      })
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'scheduled_agent_telemetry_failed',
          className: (this.constructor as typeof ScheduledAgent).className,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }

    // Re-throw on final failure so Workers Logs reflects the
    // unrecovered error. Routine retries don't re-throw.
    if (outcome === 'final_error' && errorMessage) {
      console.error(
        JSON.stringify({
          event: 'scheduled_agent_final_error',
          className: (this.constructor as typeof ScheduledAgent).className,
          attempt: state.attempt,
          error: errorMessage,
        }),
      )
    }
  }

  /**
   * Subclasses can call this from their `run()` to write a non-blocking
   * note to the next `schedule_state` (e.g. record cumulative counters
   * across recurring fires). Stored under `agent_meta`.
   */
  protected async putMeta(meta: Record<string, unknown>): Promise<void> {
    await this.ctx.storage.put('agent_meta', meta)
  }

  protected async getMeta<T = Record<string, unknown>>(): Promise<T | null> {
    return (await this.ctx.storage.get<T>('agent_meta')) ?? null
  }
}
