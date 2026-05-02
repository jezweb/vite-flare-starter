/**
 * Inbox row-shape registry — pluggable renderers per row kind.
 *
 * Inbox rows take many shapes (decisions awaiting approval, findings
 * the AI noticed, digests of bulk activity, future: mentions, action
 * items). Rather than a single fat row component with N conditionals,
 * each shape is a self-contained renderer registered in
 * `ROW_RENDERERS`. The first matching renderer wins; FindingRow is
 * the fallback (it must remain last).
 *
 * Forks add new shapes by:
 *   1. Adding a renderer component under `components/rows/` that
 *      consumes `RowRendererProps` and composes `RowShell` (or rolls
 *      its own ListRow scaffolding).
 *   2. Inserting an entry in `ROW_RENDERERS` *before* the FindingRow
 *      fallback, with a `match` predicate that picks the rows it
 *      handles.
 *
 * Shared scaffolding (selection checkbox, ContextMenu, focus ring,
 * keyboard friendliness) lives in `components/rows/shared.tsx` —
 * `RowShell`, `StandardMeta`, `ImportancePill`, `useAgentRegistry`.
 */
import type { ReactNode } from 'react'
import type { UnifiedRow } from '@/shared/schemas/inbox.schema'
import { DecisionRow } from './components/rows/DecisionRow'
import { DigestRow } from './components/rows/DigestRow'
import { FindingRow } from './components/rows/FindingRow'

// Re-export shared types so consumers can import everything from
// `@/client/modules/inbox/row-shapes` without reaching into shared/.
export type { InboxImportance, UnifiedRow } from '@/shared/schemas/inbox.schema'

export interface RowRendererProps {
  row: UnifiedRow
  isSelected: boolean
  isFocused: boolean
  selectionMode: boolean
  onToggleSelect: () => void
  onFocusChange: () => void
  onOpenApproval: (id: string) => void
  rowRef: (el: HTMLDivElement | null) => void
}

export interface InboxRowRenderer {
  /** Stable id for the shape; surfaced for tests and devtools. */
  shape: string
  /** First match wins. The last entry must match-everything (fallback). */
  match: (row: UnifiedRow) => boolean
  /** React component that renders the row. */
  render: (props: RowRendererProps) => ReactNode
}

const isDigestKind = (kind: string) => /[_-]digest$/i.test(kind)

/**
 * Order matters — first match wins. Append new built-ins **before**
 * the FindingRow fallback. Forks add new shapes by editing this list
 * (or forking this file entirely).
 */
export const ROW_RENDERERS: InboxRowRenderer[] = [
  {
    shape: 'decision',
    match: (r) => r.source === 'approval',
    render: DecisionRow,
  },
  {
    shape: 'digest',
    match: (r) => r.source === 'inbox' && isDigestKind(r.kind),
    render: DigestRow,
  },
  {
    shape: 'finding',
    match: () => true, // fallback — must be last
    render: FindingRow,
  },
]

export function resolveRenderer(row: UnifiedRow): InboxRowRenderer {
  for (const r of ROW_RENDERERS) {
    if (r.match(row)) return r
  }
  // Unreachable — FindingRow matches everything — but satisfies TS.
  return ROW_RENDERERS[ROW_RENDERERS.length - 1]!
}
