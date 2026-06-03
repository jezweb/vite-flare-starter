/**
 * FindingRow — fallback shape for inbox rows. The row already gives
 * the user the headline they need; a full detail page doesn't exist
 * yet, so clicking it toggles the read state.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import { apiClient } from '@/client/lib/api-client'
import { cn } from '@/lib/utils'
import type { RowRendererProps } from '../../row-shapes'
import { RowShell, StandardMeta, useAgentRegistry } from './shared'

export function FindingRow(props: RowRendererProps) {
  const { row } = props
  const queryClient = useQueryClient()
  const agentRegistry = useAgentRegistry()
  const isUnread = row.source === 'inbox' && row.readAt == null
  const isUrgent = row.importance === 'high' || (row.dueAt != null && row.dueAt * 1000 < Date.now())

  const toggleRead = useMutation({
    mutationFn: () => apiClient.patch(`/api/inbox/${row.id}`, { read: !!isUnread }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  })

  return (
    <RowShell
      {...props}
      state={isUnread ? 'unread' : isUrgent ? 'urgent' : 'default'}
      icon={<Inbox className={cn(isUnread ? 'text-primary' : 'text-muted-foreground')} />}
      meta={<StandardMeta row={row} agentRegistry={agentRegistry} />}
      trailing={
        <span className="text-[10px] text-muted-foreground/0 transition-colors group-hover/list-row:text-muted-foreground">
          {isUnread ? 'Mark read' : 'Mark unread'}
        </span>
      }
      onRowClick={() => toggleRead.mutate()}
    />
  )
}
