# Inbox consolidation — plan

**Date**: 2026-05-02
**Status**: Slices A + A-prime + B shipped; Slice C (triage polish) pending
**Linked**: dogfood feedback "talk to me about the inbox"

## Vision

Inbox = single attention surface for everything the AI has produced or
proposed that needs your eyes. Email-shaped. Replaces the parallel
Approvals page, surfaces findings + decisions + future row types
(digests, action items, mentions) in one triage flow.

## Three slices

### Slice A — Fold Approvals into Inbox

**Goal**: remove the parallel Approvals sidebar surface so users have
one place to triage attention items.

**Shipped today (commit pending):**
- Removed "Approvals" sidebar entry from Insights section
- `/dashboard/approvals` route preserved for deep-link compatibility
  (notifications, queued action emails)

**Deferred (Slice A-prime, ~1 hour):**
- Extract `ApprovalCard` from `ApprovalsPage` into
  `src/client/modules/approvals/components/ApprovalCard.tsx` — keep
  `MemoryProposalPreview`, `plainTitle`, `sourceLabel`, `StatusBadge`
  helpers alongside it
- Inbox approval row click: replace `navigate('/dashboard/approvals?focus=…')`
  with a Sheet that fetches the approval + renders `ApprovalCard` inline
- Standalone `/dashboard/approvals` route renders the same Sheet
  contents as a single-row page (deep-link compat)
- Drop the `ApprovalsPage` list view (the list lives in Inbox now)

### Slice B — Pluggable row shapes ✅ SHIPPED 2026-05-02

**Goal**: rows render with shape-appropriate visual treatment instead
of the generic ListRow template.

**Files**:
- `src/client/modules/inbox/row-shapes.tsx` — registry, shared
  scaffolding (`RowShell`), three built-in renderers, helpers
  (`StandardMeta`, `ImportancePill`, `formatKind`)
- `src/client/modules/inbox/pages/InboxPage.tsx` — refactored to
  dispatch through `resolveRenderer(row).render`. Inline `InboxRow`
  removed (~190 lines), unused imports dropped, page now ~430 lines
  (was ~750)

**Three built-in renderers shipped:**

1. **DecisionRow** — fires for `source === 'approval'`. Inline Approve
   / Reject buttons for `status === 'pending'`; collapses to a status
   badge for already-decided approvals so the All tab doesn't invite a
   re-vote. Tap row body to open Sheet for full preview.
2. **DigestRow** — fires for `source === 'inbox' && /[_-]digest$/.test(kind)`.
   Currently visual differentiation only; click toggles read until a
   `/dashboard/digests/:id` route exists. Won't fire on production data
   yet (no digest kinds being emitted).
3. **FindingRow** — fallback (`match: () => true`). Behaviour-equivalent
   to the previous default inbox row.

**Architecture: renderer registry**

```ts
// src/client/modules/inbox/row-shapes.ts
export interface InboxRowRenderer {
  shape: string                              // "decision" | "finding" | "digest" | "action_item"
  match: (row: UnifiedRow) => boolean        // pick the right renderer
  render: (props: RowProps) => ReactNode
}

export const ROW_RENDERERS: InboxRowRenderer[] = [
  { shape: 'decision',    match: (r) => r.source === 'approval', render: DecisionRow },
  { shape: 'digest',      match: (r) => r.kind?.endsWith('-digest') ?? false, render: DigestRow },
  { shape: 'finding',     match: () => true /* fallback */,        render: FindingRow },
]
```

`InboxPage` resolves the first matching renderer per row. Forks add
new shapes by appending to the array.

**Three shipped row shapes:**

1. **DecisionRow** — Approve/Reject inline (no second click for low-
   stakes decisions). Configurable per agent class via metadata. Memory
   approvals + tool approvals go through this.

2. **FindingRow** — Summary visible without expansion, sources cited
   inline. Expand for full reasoning + structured payload.

3. **DigestRow** — Preview + "Open full digest" button. Different from
   findings in that the *content is the point* — it's an artifact, not
   a notification.

**Future shapes (forks add as needed):**
- `action_item` — checkbox + due date + open
- `mention` — context preview (chat / space) + jump-to-context

### Slice C — Triage actions polish

**Goal**: Inbox feels like a real inbox, not a list.

- **Snooze** — hide row until X (4 hours / tomorrow / next week / pick
  date). Server-side `inbox_items.snoozedUntil` column + filter.
- **Pin** — sticky to top. Server-side `inbox_items.pinnedAt`.
- **Bulk actions** — select multiple → archive / mark-read (some
  exists; needs polish)
- **Filter chips** — by source (decisions / findings), by agent
- **Smart sort options** — beyond default importance→due→created

## What's NOT in scope

- Notification bell consolidation — bell shows transient events
  (login, share, mentions); Inbox shows AI-emitted attention items.
  Different layers, intentional.
- Activity log — observability surface, separate from "needs my
  attention" surface.

## Estimated total effort

| Slice | Effort | Status |
|---|---|---|
| A (sidebar nav) | ~5 min | done |
| A-prime (ApprovalCard extract + Sheet) | ~1 hour | done |
| B (renderer registry + 3 shapes) | ~2 hours | done |
| C (triage polish) | ~1.5 hours | pending |

## Resume instructions

1. Read this plan
2. Confirm with Jez whether to bundle A-prime with B or ship A-prime
   first then B as a follow-up
3. Each slice commits independently

---

**Last Updated**: 2026-05-02
