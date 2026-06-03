/**
 * useReactToMessage — POST /api/messages/:id/reactions.
 *
 * Optimistic update: immediately patch the cached message in
 * top-level + thread query buckets so the UI is instant. The server
 * later broadcasts the new shape over the WS, which our cache hook
 * idempotently applies.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import type { SpaceMessage } from './useSpaces'

export function useReactToMessage() {
  const qc = useQueryClient()
  return useMutation<
    { ok: boolean; reactions: Record<string, string[]> },
    Error,
    { messageId: string; emoji: string; action: 'add' | 'remove' }
  >({
    mutationFn: ({ messageId, emoji, action }) =>
      apiClient.post<{ ok: boolean; reactions: Record<string, string[]> }>(
        `/api/messages/${messageId}/reactions`,
        { emoji, action }
      ),
    onSuccess: (data, vars) => {
      // Sync the reactions JSON across every cached space-messages bucket.
      const queries = qc.getQueriesData<{ messages: SpaceMessage[] }>({ queryKey: ['spaces'] })
      for (const [key, value] of queries) {
        if (!value || !Array.isArray(value.messages)) continue
        const next = {
          messages: value.messages.map((m) =>
            m.id === vars.messageId ? { ...m, reactions: data.reactions } : m
          ),
        }
        qc.setQueryData(key, next)
      }
    },
  })
}
