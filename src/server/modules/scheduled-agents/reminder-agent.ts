/**
 * ReminderAgent — worked example of the ScheduledAgent pattern
 *
 * One-shot scheduled reminder. Caller schedules a future fire with
 * a message; when the alarm fires, we drop a row into the user's
 * `userNotifications` table so it appears in their notification
 * panel.
 *
 * This is deliberately the smallest "real" example we can ship:
 *   - Uses an existing table (notifications) so no extra migration
 *   - Demonstrates per-user partitioning via `idFromName(userId:slug)`
 *   - Shows payload validation
 *   - Shows resultMetadata being recorded for diagnostics
 *
 * Forks wanting a recurring agent (digest, sync, heartbeat) can copy
 * this file and call `this.schedule(now + interval, ...)` from inside
 * `run()` to chain the next fire.
 */
import { drizzle } from 'drizzle-orm/d1'
import { ScheduledAgent, type ScheduledAgentEnv } from '@/server/lib/agents/scheduled-agent'
import { userNotifications } from '@/server/modules/notifications/db/schema'

interface ReminderEnv extends ScheduledAgentEnv {
  // Reminders don't need anything beyond DB access — but real
  // recurring agents typically also touch R2/AI/etc. Subclasses
  // extend this binding shape as needed.
}

export interface ReminderPayload {
  /** The message that lands as the notification body. */
  message: string
  /** Optional title; defaults to "Reminder". */
  title?: string
  /** Optional link to deep-link the notification to a route. */
  link?: string
}

export class ReminderAgent extends ScheduledAgent<ReminderPayload> {
  static override readonly className = 'ReminderAgent'

  // Reminders are user-facing — a missed retry is annoying but not
  // catastrophic, and trying again much later (1h+) just confuses
  // the user. Tighter, fewer retries.
  protected override get backoffMs(): number[] {
    return [10_000, 60_000, 300_000] // 10s, 1m, 5m. 4 attempts total.
  }

  override async run(payload: ReminderPayload, attempt: number): Promise<{ notificationId: string; attempt: number }> {
    const env = this.env as ReminderEnv
    const state = await this.getSchedule()
    const userId = state.state?.userId
    if (!userId) {
      // Without a user we have nowhere to deliver — surface as a
      // hard error so it's loud in the dashboard.
      throw new Error('ReminderAgent requires opts.userId on schedule()')
    }
    const db = drizzle(env.DB)
    const id = crypto.randomUUID()
    await db.insert(userNotifications).values({
      id,
      userId,
      type: 'info',
      title: payload.title ?? 'Reminder',
      message: payload.message,
      data: payload.link ? JSON.stringify({ link: payload.link }) : null,
    })
    return { notificationId: id, attempt }
  }
}
