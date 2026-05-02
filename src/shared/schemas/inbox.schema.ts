/**
 * Inbox Schemas — shared between client and server
 *
 * Issue #50 decision A: the inbox endpoint joins `inbox_items` and
 * pending `pending_approvals` rows into a single shape the UI renders
 * uniformly. That shape lives here so both ends import the same
 * source of truth.
 */

export const INBOX_IMPORTANCE = ['high', 'medium', 'low'] as const
export type InboxImportance = (typeof INBOX_IMPORTANCE)[number]

/**
 * Unified inbox row — projection of `inbox_items` + `pending_approvals`
 * into a single shape returned by `GET /api/inbox` and consumed by the
 * row-shape registry on the client.
 *
 * Server: emit rows in this exact shape.
 * Client: dispatch to a renderer based on `source` / `kind`.
 */
export interface UnifiedRow {
  id: string
  source: 'inbox' | 'approval'
  kind: string
  summary: string
  importance: InboxImportance | null
  agentClass: string | null
  createdAt: number
  dueAt: number | null
  decidedAt: number | null
  readAt: number | null
  /** For approvals only — pending|approved|rejected|... */
  status?: string
}
