/**
 * DigestRow — for inbox rows whose `kind` ends in `_digest`/`-digest`.
 * Shows the row as a content artifact rather than a notification.
 *
 * Currently a visual differentiation only; clicking still toggles read
 * because there's no `/dashboard/digests/:id` route yet. When digest
 * detail lands, replace the click handler with
 * `navigate('/dashboard/digests/' + row.id)`.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, ChevronRight } from 'lucide-react'
import { apiClient } from '@/client/lib/api-client'
import { cn } from '@/lib/utils'
import type { RowRendererProps } from '../../row-shapes'
import { RowShell, StandardMeta, useAgentRegistry } from './shared'

export function DigestRow(props: RowRendererProps) {
  const { row } = props
  const queryClient = useQueryClient()
  const agentRegistry = useAgentRegistry()
  const isUnread = row.source === 'inbox' && row.readAt == null

  const toggleRead = useMutation({
    mutationFn: () => apiClient.patch(`/api/inbox/${row.id}`, { read: !!isUnread }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  })

  return (
    <RowShell
      {...props}
      state={isUnread ? 'unread' : 'default'}
      icon={<FileText className={cn(isUnread ? 'text-primary' : 'text-muted-foreground')} />}
      meta={<StandardMeta row={row} agentRegistry={agentRegistry} />}
      trailing={
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover/list-row:text-foreground">
          {isUnread ? 'Open digest' : 'Open'}
          <ChevronRight className="size-3" />
        </span>
      }
      onRowClick={() => toggleRead.mutate()}
    />
  )
}
