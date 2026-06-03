/**
 * ReminderAgent — SDK-native scheduled work
 *
 * Worked example of the Cloudflare `agents` SDK schedule pattern.
 * One-shot reminder: caller schedules a future fire with a payload;
 * when the alarm fires, we drop a row into the user's
 * `userNotifications` table.
 *
 * Pattern notes for forks:
 *   - Extending `Agent` (not raw DurableObject) gives us schedule()
 *     / scheduleEvery() / queue() / retry() / getSchedules() /
 *     cancelSchedule() built-in, plus state sync, RPC via `@callable`,
 *     WebSocket hibernation, MCP client, and observability events for
 *     free. Don't hand-roll any of these.
 *   - The methods below ARE the public RPC surface — server-to-server
 *     RPC (route layer → agent stub) calls plain DO methods directly.
 *     The SDK's `@callable` decorator is only needed when exposing
 *     methods to a WebSocket client (browser-side useAgent). Workerd
 *     doesn't yet support stage-3 decorator syntax in source, so we
 *     avoid it here. If a fork wants WebSocket-callable methods, run
 *     a Vite plugin that lowers stage-3 decorators (e.g.
 *     @swc/plugin-decorators or babel-plugin-proposal-decorators).
 *   - `fireReminder` is the alarm callback. The SDK invokes it by
 *     name when the scheduled time arrives. Throwing schedules a
 *     retry (per the `retry` options on the schedule call).
 *   - For recurring reminders, swap `schedule()` for `scheduleEvery()`
 *     in `scheduleReminder` — same shape otherwise.
 *
 * Per-user partitioning: the route uses
 * `getAgentByName(env.ReminderAgent, \`\${userId}:\${slug}\`)` so each
 * user's reminders live in their own DO instance. Cancelling /
 * inspecting one user's reminders never touches another user's.
 */
import { Agent } from 'agents'
import { drizzle } from 'drizzle-orm/d1'
import { userNotifications } from '@/server/modules/notifications/db/schema'

interface Env {
  DB: D1Database
}

/** State synced to any WS clients connected to this agent. Lets a UI
 *  show "this agent belongs to user X, has N pending reminders".
 *  Empty by default — populated lazily on first schedule. */
interface ReminderState {
  /** Owning user id — set on first schedule call. Used as the audit
   *  trail for cancel/inspect flows when the route already has the
   *  user from auth context. */
  userId: string | null
}

export interface ReminderPayload {
  message: string
  title?: string
  link?: string
  /** UserId travels in the payload because the SDK invokes the
   *  fire callback with just (payload, schedule) — no agent context
   *  arg. We need it to write the notification row. */
  userId: string
}

/** Public-shape of a scheduled reminder, returned from list/get RPCs.
 *  Trims the SDK's internal `Schedule<T>` to fields the UI needs. */
export interface ReminderInfo {
  id: string
  fireAt: number
  payload: ReminderPayload
}

export class ReminderAgent extends Agent<Env, ReminderState> {
  /** SDK static options. WebSocket hibernation is on by default; we
   *  spell it out for self-documentation. */
  static override options = {
    hibernate: true as const,
  }

  override initialState: ReminderState = {
    userId: null,
  }

  /**
   * Schedule a reminder. Public RPC method — the route layer calls
   * this via the agent stub. Wraps `this.schedule()` so callers don't
   * need to know the internal callback name (`fireReminder`) or the
   * retry policy.
   *
   * Returns the SDK-generated schedule id, which the caller stores
   * to enable later cancellation / status lookup.
   */
  async scheduleReminder(
    when: number,
    payload: ReminderPayload
  ): Promise<{ scheduleId: string; fireAt: number }> {
    if (this.state.userId !== payload.userId) {
      this.setState({ userId: payload.userId })
    }
    const schedule = await this.schedule<ReminderPayload>(when, 'fireReminder', payload, {
      // Tighter retry than the SDK default — late reminder retries
      // (1h+) are noise, not value, for user-facing notifications.
      retry: {
        maxAttempts: 4,
        baseDelayMs: 10_000,
        maxDelayMs: 300_000,
      },
    })
    return { scheduleId: schedule.id, fireAt: when }
  }

  /**
   * Cancel a previously-scheduled reminder by id. Idempotent — returns
   * `cancelled: false` if the schedule was already fired or never existed.
   */
  async cancelReminder(scheduleId: string): Promise<{ cancelled: boolean }> {
    const ok = await this.cancelSchedule(scheduleId)
    return { cancelled: ok }
  }

  /**
   * List all pending one-shot reminders for this user partition. Used
   * by the status route — the UI shows "you have 3 reminders queued".
   * Recurring reminders (if a fork extends to those) would query both
   * `scheduled` and `interval` types.
   */
  async listPendingReminders(): Promise<ReminderInfo[]> {
    const schedules = this.getSchedules<ReminderPayload>({ type: 'scheduled' })
    return schedules.map((s) => ({
      id: s.id,
      fireAt: s.time,
      payload: s.payload as ReminderPayload,
    }))
  }

  /**
   * The alarm callback. SDK invokes this when the scheduled fire
   * arrives. Throwing schedules a retry per the `retry` options
   * passed to `this.schedule()` above. After exhausted retries the
   * SDK marks the schedule as failed and emits an observability
   * event — visible in Workers Logs.
   *
   * NOT marked `@callable` — internal-only; the SDK calls it directly.
   */
  async fireReminder(payload: ReminderPayload): Promise<void> {
    const id = crypto.randomUUID()
    const db = drizzle(this.env.DB)
    await db.insert(userNotifications).values({
      id,
      userId: payload.userId,
      type: 'info',
      title: payload.title ?? 'Reminder',
      message: payload.message,
      data: payload.link ? JSON.stringify({ link: payload.link }) : null,
    })
  }
}
