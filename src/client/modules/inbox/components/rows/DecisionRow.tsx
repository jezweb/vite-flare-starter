/**
 * DecisionRow — for approval rows. Adds inline Approve / Reject
 * buttons so low-friction decisions ("save this memory", "approve
 * this tool call") don't require a Sheet round-trip. Tap the row body
 * to open the Sheet for full preview + reasoning when you want it.
 *
 * For non-pending approvals the buttons collapse to a status badge so
 * the row stays informative in the All tab without inviting a re-vote.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckSquare, ChevronRight, Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/client/lib/api-client'
import type { RowRendererProps } from '../../row-shapes'
import { RowShell, StandardMeta, useAgentRegistry } from './shared'

export function DecisionRow(props: RowRendererProps) {
  const { row, onOpenApproval } = props
  const queryClient = useQueryClient()
  const agentRegistry = useAgentRegistry()

  const isPending = !row.status || row.status === 'pending'
  const isUrgent = row.importance === 'high' || (row.dueAt != null && row.dueAt * 1000 < Date.now())

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['inbox'] })
    queryClient.invalidateQueries({ queryKey: ['approvals'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const approve = useMutation({
    mutationFn: () => apiClient.post(`/api/approvals/${row.id}/approve`, {}),
    onSuccess: () => {
      invalidateAll()
      toast.success('Approved')
    },
    onError: (e) => toast.error((e as Error).message),
  })

  const reject = useMutation({
    mutationFn: () => apiClient.post(`/api/approvals/${row.id}/reject`, { reason: '' }),
    onSuccess: () => {
      invalidateAll()
      toast.success('Rejected')
    },
    onError: (e) => toast.error((e as Error).message),
  })

  const busy = approve.isPending || reject.isPending

  const trailing = isPending ? (
    <span className="flex items-center gap-1">
      <Button
        size="sm"
        variant="default"
        className="h-7 px-2"
        onClick={(e) => {
          e.stopPropagation()
          approve.mutate()
        }}
        disabled={busy}
        aria-label="Approve"
        title="Approve"
      >
        <Check className="size-3.5" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2"
        onClick={(e) => {
          e.stopPropagation()
          reject.mutate()
        }}
        disabled={busy}
        aria-label="Reject"
        title="Reject"
      >
        <X className="size-3.5" />
      </Button>
      <span className="ml-1 hidden items-center gap-1 text-xs text-muted-foreground transition-colors group-hover/list-row:text-foreground sm:inline-flex">
        Review
        <ChevronRight className="size-3" />
      </span>
    </span>
  ) : (
    <Badge variant="outline" className="text-[10px] capitalize">
      {row.status}
    </Badge>
  )

  return (
    <RowShell
      {...props}
      state={isUrgent ? 'urgent' : 'default'}
      icon={<CheckSquare className="text-amber-500" />}
      meta={
        <StandardMeta
          row={row}
          agentRegistry={agentRegistry}
          prefix={
            <>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 leading-3">
                Needs approval
              </Badge>
              <span>·</span>
            </>
          }
        />
      }
      trailing={trailing}
      onRowClick={() => onOpenApproval(row.id)}
    />
  )
}
