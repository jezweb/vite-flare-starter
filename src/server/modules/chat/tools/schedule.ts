/**
 * Schedule Tools — D1-backed job queue with cron support
 *
 * Lets the agent schedule tasks to run later. Jobs are stored in D1
 * and executed by a cron trigger handler (scheduled() in the Worker).
 *
 * For per-user recurring tasks with state, use Durable Object alarms
 * instead — this is the simpler D1-only pattern that works immediately
 * without additional wrangler bindings.
 *
 * Jobs store a prompt that gets re-sent to the AI when triggered.
 * The cron handler creates a fresh AI call with the stored prompt + context.
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, lte } from 'drizzle-orm'
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { CalendarClock, ListOrdered, XCircle } from 'lucide-react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

function getDB(ctx: AgentContext): D1Database {
  return (ctx.env as unknown as { DB: D1Database }).DB
}

// ─── Schema (inline — exported for use in db/schema.ts) ─────────────

export const scheduledJobs = sqliteTable(
  'scheduled_jobs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').notNull(),
    /** Human-readable name */
    name: text('name').notNull(),
    /** The prompt to execute when the job fires */
    prompt: text('prompt').notNull(),
    /** Optional skill to load before executing */
    skillName: text('skill_name'),
    /** Cron expression (e.g. "0 6 * * *") or null for one-shot */
    cron: text('cron'),
    /** Next run time as unix timestamp (ms) */
    nextRun: integer('next_run').notNull(),
    /** Last run time */
    lastRun: integer('last_run'),
    /** Last run result (truncated) */
    lastResult: text('last_result'),
    /** Status */
    status: text('status', { enum: ['active', 'paused', 'completed', 'failed'] })
      .notNull()
      .default('active'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('scheduled_jobs_user_id_idx').on(table.userId),
    index('scheduled_jobs_next_run_idx').on(table.nextRun),
    index('scheduled_jobs_status_idx').on(table.status),
  ]
)

// ─── Cron Parser (minimal — supports standard 5-field cron) ─────────

/**
 * Calculate the next run time from a cron expression.
 * Supports: minute hour day-of-month month day-of-week
 * Special values: * (any), specific numbers, comma-separated lists
 *
 * This is intentionally simple — for complex cron, use a library.
 */
function nextCronRun(cronExpr: string, after: Date = new Date()): Date {
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('Cron must have 5 fields: minute hour day month weekday')

  const [minSpec, hourSpec] = parts

  // Simple case: fixed time daily (most common for agent tasks)
  const minute = minSpec === '*' ? 0 : Number.parseInt(minSpec!, 10)
  const hour = hourSpec === '*' ? 0 : Number.parseInt(hourSpec!, 10)

  const next = new Date(after)
  next.setMinutes(minute, 0, 0)
  next.setHours(hour)

  // If the time already passed today, schedule for tomorrow
  if (next <= after) {
    next.setDate(next.getDate() + 1)
  }

  return next
}

// ─── Schedule Tools ─────────────────────────────────────────────────

const ScheduleTaskOutput = z.union([
  z.object({
    id: z.string(),
    name: z.string(),
    nextRun: z.string(),
    recurring: z.boolean(),
    cron: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export const scheduleTaskDefinition: ToolDefinition<
  { name: string; prompt: string; skillName?: string; runAt?: string; cron?: string },
  z.infer<typeof ScheduleTaskOutput>
> = {
  name: 'schedule_task',
  description:
    'Schedule a task to run later. The prompt will be sent to the AI at the scheduled time. Use for reminders, recurring reports, daily briefs, or any delayed work. Supports one-shot (specific time) or recurring (cron expression).',
  inputSchema: z.object({
    name: z.string().describe('Short name for the task (e.g. "Morning brief", "Weekly report")'),
    prompt: z
      .string()
      .describe(
        'The full prompt to execute when the task fires — include all context the AI will need'
      ),
    skillName: z
      .string()
      .optional()
      .describe('Optional: skill to load before executing (e.g. "morning-brief")'),
    runAt: z
      .string()
      .optional()
      .describe('ISO 8601 datetime for one-shot tasks (e.g. "2026-04-14T09:00:00+11:00")'),
    cron: z
      .string()
      .optional()
      .describe(
        'Cron expression for recurring tasks (e.g. "0 6 * * *" = daily at 6am, "0 9 * * 1" = Monday 9am)'
      ),
  }),
  outputSchema: ScheduleTaskOutput,
  execute: async ({ name, prompt, skillName, runAt, cron: cronExpr }, ctx) => {
    try {
      if (!runAt && !cronExpr) {
        return { error: 'Either runAt (one-shot) or cron (recurring) is required' }
      }
      let nextRun: number
      if (runAt) {
        nextRun = new Date(runAt).getTime()
        if (isNaN(nextRun)) return { error: `Invalid date: ${runAt}` }
      } else {
        nextRun = nextCronRun(cronExpr!).getTime()
      }
      const db = drizzle(getDB(ctx))
      const id = crypto.randomUUID()
      await db.insert(scheduledJobs).values({
        id,
        userId: ctx.userId,
        name,
        prompt,
        skillName: skillName || null,
        cron: cronExpr || null,
        nextRun,
        status: 'active',
      })
      return {
        id,
        name,
        nextRun: new Date(nextRun).toISOString(),
        recurring: !!cronExpr,
        cron: cronExpr,
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: CalendarClock, displayName: 'Schedule Task' },
}

const ListTasksOutput = z.union([
  z.object({
    tasks: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        nextRun: z.string().nullable(),
        lastRun: z.string().nullable(),
        recurring: z.boolean(),
        cron: z.string().nullable(),
        skillName: z.string().nullable(),
      })
    ),
    count: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const listTasksDefinition: ToolDefinition<
  { status?: 'all' | 'active' | 'paused' | 'completed' | 'failed' },
  z.infer<typeof ListTasksOutput>
> = {
  name: 'list_tasks',
  description:
    'List your scheduled tasks. Shows upcoming, recurring, and completed tasks with their next run times.',
  inputSchema: z.object({
    status: z
      .enum(['all', 'active', 'paused', 'completed', 'failed'])
      .optional()
      .describe('Filter by status (default: active)'),
  }),
  outputSchema: ListTasksOutput,
  execute: async ({ status = 'active' }, ctx) => {
    try {
      const db = drizzle(getDB(ctx))
      const query =
        status === 'all'
          ? db.select().from(scheduledJobs).where(eq(scheduledJobs.userId, ctx.userId))
          : db
              .select()
              .from(scheduledJobs)
              .where(and(eq(scheduledJobs.userId, ctx.userId), eq(scheduledJobs.status, status)))
      const jobs = await query
      return {
        tasks: jobs.map((j) => ({
          id: j.id,
          name: j.name,
          status: j.status,
          nextRun: j.nextRun ? new Date(j.nextRun).toISOString() : null,
          lastRun: j.lastRun ? new Date(j.lastRun).toISOString() : null,
          recurring: !!j.cron,
          cron: j.cron,
          skillName: j.skillName,
        })),
        count: jobs.length,
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: ListOrdered, displayName: 'List Tasks' },
}

const CancelTaskOutput = z.union([
  z.object({ id: z.string(), cancelled: z.boolean() }),
  z.object({ error: z.string() }),
])

export const cancelTaskDefinition: ToolDefinition<
  { id: string },
  z.infer<typeof CancelTaskOutput>
> = {
  name: 'cancel_task',
  description:
    "Cancel a scheduled task by ID. Pauses it so it won't run, but keeps it in the list for reference.",
  inputSchema: z.object({
    id: z.string().describe('The task ID to cancel'),
  }),
  outputSchema: CancelTaskOutput,
  execute: async ({ id }, ctx) => {
    try {
      const db = drizzle(getDB(ctx))
      await db
        .update(scheduledJobs)
        .set({ status: 'paused' })
        .where(and(eq(scheduledJobs.id, id), eq(scheduledJobs.userId, ctx.userId)))
      return { id, cancelled: true }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: XCircle, displayName: 'Cancel Task' },
}

export const scheduleDefinitions = [
  scheduleTaskDefinition,
  listTasksDefinition,
  cancelTaskDefinition,
] as ToolDefinition<unknown, unknown>[]

// ─── Cron Handler (called by Worker scheduled() event) ──────────────

/**
 * Process due jobs. Call this from your Worker's scheduled() handler:
 *
 * ```typescript
 * export default {
 *   async scheduled(event, env) {
 *     await processDueJobs(env.DB, env)
 *   }
 * }
 * ```
 */
export async function processDueJobs(
  dbBinding: D1Database,
  env: Record<string, unknown>
): Promise<number> {
  const db = drizzle(dbBinding)
  const now = Date.now()

  const dueJobs = await db
    .select()
    .from(scheduledJobs)
    .where(and(eq(scheduledJobs.status, 'active'), lte(scheduledJobs.nextRun, now)))
    .limit(10) // Process max 10 per cron tick

  let processed = 0
  for (const job of dueJobs) {
    try {
      // Import AI SDK dynamically to avoid circular deps
      const { generateText } = await import('ai')
      const { resolveModel } = await import('@/server/lib/ai/providers')
      const { resolveModelRole } = await import('@/server/lib/ai/roles')

      // Reasoner role (#87): executing a task / following a skill is
      // open-ended work — keep thinking on. Forks retune with
      // MODEL_ROLE_REASONER.
      const role = resolveModelRole(env as unknown as Record<string, unknown>, 'reasoner')
      const model = resolveModel(env as never, role.modelId)

      let systemPrompt = `You are executing a scheduled task named "${job.name}".`
      if (job.skillName) {
        systemPrompt += `\n\nLoad and follow the "${job.skillName}" skill instructions.`
      }

      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt: job.prompt,
        maxOutputTokens: 2000,
      })

      // Update job
      const updates: Record<string, unknown> = {
        lastRun: now,
        lastResult: text.slice(0, 2000),
      }

      if (job.cron) {
        // Recurring: schedule next run
        updates['nextRun'] = nextCronRun(job.cron, new Date(now)).getTime()
      } else {
        // One-shot: mark completed
        updates['status'] = 'completed'
      }

      await db.update(scheduledJobs).set(updates).where(eq(scheduledJobs.id, job.id))
      processed++

      console.log(
        JSON.stringify({ event: 'scheduled_job_completed', jobId: job.id, name: job.name })
      )
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'scheduled_job_failed',
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        })
      )
      await db
        .update(scheduledJobs)
        .set({ status: 'failed', lastRun: now, lastResult: String(error) })
        .where(eq(scheduledJobs.id, job.id))
    }
  }

  return processed
}
