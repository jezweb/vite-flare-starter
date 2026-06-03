/**
 * config-diff storage layer — thin wrapper over the D1 table.
 *
 * Deliberately small: create, get, list, mark-applied, mark-rejected.
 * The `apply` switch lives in ./apply.ts and is called by routes after
 * this layer confirms the proposal is pending.
 */
import { and, desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { configDiffProposals } from './db/schema'
import type {
  ConfigDiffProposal,
  ConfigDiffResource,
  ConfigDiffStatus,
  CreateProposalInput,
} from '@/shared/config/diff-proposal'

export type D1 = Parameters<typeof drizzle>[0]

function rowToProposal(row: typeof configDiffProposals.$inferSelect): ConfigDiffProposal {
  return {
    id: row.id,
    userId: row.userId,
    resource: {
      kind: row.resourceKind,
      id: row.resourceId,
      label: row.resourceLabel,
    },
    before: row.before,
    after: row.after,
    summary: row.summary,
    reason: row.reason,
    format: row.format,
    createdBy: {
      type: row.createdByType,
      userId: row.userId,
      modelId: row.createdByModel ?? undefined,
    },
    createdAt: row.createdAt.getTime(),
    status: row.status,
    resolvedAt: row.resolvedAt ? row.resolvedAt.getTime() : null,
  }
}

export async function createProposal(
  d1: D1,
  userId: string,
  input: CreateProposalInput
): Promise<ConfigDiffProposal> {
  const db = drizzle(d1)
  const id = crypto.randomUUID()
  const [row] = await db
    .insert(configDiffProposals)
    .values({
      id,
      userId,
      resourceKind: input.resource.kind,
      resourceId: input.resource.id,
      resourceLabel: input.resource.label,
      before: input.before,
      after: input.after,
      summary: input.summary,
      reason: input.reason ?? null,
      format: input.format ?? 'markdown',
      createdByType: input.createdBy.type,
      createdByModel: input.createdBy.modelId ?? null,
      status: 'pending',
    })
    .returning()
  if (!row) throw new Error('Failed to create proposal')
  return rowToProposal(row)
}

export async function getProposal(
  d1: D1,
  userId: string,
  id: string
): Promise<ConfigDiffProposal | null> {
  const db = drizzle(d1)
  const rows = await db
    .select()
    .from(configDiffProposals)
    .where(and(eq(configDiffProposals.id, id), eq(configDiffProposals.userId, userId)))
    .limit(1)
  return rows[0] ? rowToProposal(rows[0]) : null
}

export async function listProposalsForResource(
  d1: D1,
  userId: string,
  resource: Pick<ConfigDiffResource, 'kind' | 'id'>,
  limit = 50
): Promise<ConfigDiffProposal[]> {
  const db = drizzle(d1)
  const rows = await db
    .select()
    .from(configDiffProposals)
    .where(
      and(
        eq(configDiffProposals.userId, userId),
        eq(configDiffProposals.resourceKind, resource.kind),
        eq(configDiffProposals.resourceId, resource.id)
      )
    )
    .orderBy(desc(configDiffProposals.createdAt))
    .limit(limit)
  return rows.map(rowToProposal)
}

export async function markProposal(
  d1: D1,
  userId: string,
  id: string,
  status: Exclude<ConfigDiffStatus, 'pending'>
): Promise<ConfigDiffProposal | null> {
  const db = drizzle(d1)
  const [row] = await db
    .update(configDiffProposals)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(configDiffProposals.id, id), eq(configDiffProposals.userId, userId)))
    .returning()
  return row ? rowToProposal(row) : null
}

/**
 * Atomic claim — flip a proposal from `pending` to a target status in
 * one SQL statement. Returns the updated row if the claim succeeded
 * (caller was first to transition), or null if the row was already in
 * another state (caller lost the race — another request got there
 * first, or the proposal is already applied/rejected).
 *
 * Used by routes to prevent double-apply: the first concurrent request
 * claims the transition, the second sees null and returns 409.
 */
export async function claimProposal(
  d1: D1,
  userId: string,
  id: string,
  targetStatus: Exclude<ConfigDiffStatus, 'pending'>
): Promise<ConfigDiffProposal | null> {
  const db = drizzle(d1)
  const [row] = await db
    .update(configDiffProposals)
    .set({ status: targetStatus, resolvedAt: new Date() })
    .where(
      and(
        eq(configDiffProposals.id, id),
        eq(configDiffProposals.userId, userId),
        eq(configDiffProposals.status, 'pending')
      )
    )
    .returning()
  return row ? rowToProposal(row) : null
}

/** Revert an accidental claim (e.g. apply handler threw after claim). */
export async function revertProposalToPending(d1: D1, userId: string, id: string): Promise<void> {
  const db = drizzle(d1)
  await db
    .update(configDiffProposals)
    .set({ status: 'pending', resolvedAt: null })
    .where(and(eq(configDiffProposals.id, id), eq(configDiffProposals.userId, userId)))
}
