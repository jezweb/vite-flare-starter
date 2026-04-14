/**
 * Soft Delete — Drizzle helpers for non-destructive deletion
 *
 * Provides a consistent deletedAt column and query helpers.
 * Tables with soft delete store a timestamp instead of removing rows.
 * A scheduled job auto-purges items older than 30 days.
 *
 * @example
 * // In schema definition:
 * import { softDeleteColumn } from '@/server/lib/soft-delete'
 * const myTable = sqliteTable('my_table', {
 *   id: text('id').primaryKey(),
 *   ...softDeleteColumn,
 * })
 *
 * // In queries:
 * import { whereNotDeleted, whereSoftDeleted } from '@/server/lib/soft-delete'
 * db.select().from(myTable).where(whereNotDeleted(myTable))
 * db.select().from(myTable).where(whereSoftDeleted(myTable))  // trash view
 */
import { integer } from 'drizzle-orm/sqlite-core'
import { isNull, isNotNull, lt, and } from 'drizzle-orm'

/** Add to any table that supports soft delete */
export const softDeleteColumn = {
  deletedAt: integer('deleted_at', { mode: 'timestamp' as const }),
}

/** Filter to active (non-deleted) records */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function whereNotDeleted(table: { deletedAt: any }) {
  return isNull(table.deletedAt)
}

/** Filter to soft-deleted records (trash view) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function whereSoftDeleted(table: { deletedAt: any }) {
  return isNotNull(table.deletedAt)
}

/** Soft delete a record (set deletedAt to now) */
export function softDeleteValues() {
  return { deletedAt: new Date() }
}

/** Restore a soft-deleted record (clear deletedAt) */
export function restoreValues() {
  return { deletedAt: null }
}

/** Filter for records ready to be permanently purged (older than N days) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wherePurgeable(table: { deletedAt: any }, daysOld: number = 30) {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000)
  return and(isNotNull(table.deletedAt), lt(table.deletedAt, cutoff))
}
