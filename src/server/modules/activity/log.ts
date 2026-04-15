/**
 * Activity logging helper.
 *
 * Wraps the activity_logs insert with sensible defaults and silent error
 * handling so callers don't have to wrap every call in try/catch.
 *
 * Fire-and-forget by default — failures are logged but not thrown, so a
 * broken audit insert never kills the user-facing request.
 */

import { drizzle } from 'drizzle-orm/d1'
import type { D1Database } from '@cloudflare/workers-types'
import type { Context } from 'hono'
import { activityLogs, type ActivityAction } from './db/schema'

export interface LogActivityInput {
  userId: string
  action: ActivityAction
  entityType: string
  entityId: string
  entityName?: string
  changes?: Record<string, { old: unknown; new: unknown }>
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

export async function logActivity(d1: D1Database, input: LogActivityInput): Promise<void> {
  try {
    const db = drizzle(d1)
    await db.insert(activityLogs).values({
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName ?? null,
      changes: input.changes ?? null,
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    })
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'activity_log_failed',
        error: error instanceof Error ? error.message : String(error),
        input: { userId: input.userId, action: input.action, entityType: input.entityType },
      })
    )
  }
}

/**
 * Convenience wrapper that pulls userId/IP/UA from a Hono context.
 * Skips silently when no userId is present (unauthenticated requests).
 */
export async function logActivityFromContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: Context<any>,
  input: Omit<LogActivityInput, 'userId' | 'ipAddress' | 'userAgent'> & { userId?: string }
): Promise<void> {
  const userId = input.userId ?? (c.get('userId') as string | undefined)
  if (!userId) return

  const ipAddress =
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    undefined
  const userAgent = c.req.header('user-agent') ?? undefined

  await logActivity(c.env.DB as D1Database, {
    ...input,
    userId,
    ipAddress,
    userAgent,
  })
}
