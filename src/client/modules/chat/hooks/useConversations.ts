/**
 * useConversations — TanStack Query hooks for conversation persistence
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import type { Message } from './useChat'

interface ConversationSummary {
  id: string
  title: string | null
  summary: string | null
  starred: number
  /** null = ungrouped; set when the chat belongs to a project. */
  projectId: string | null
  model: string | null
  createdAt: string
  updatedAt: string
}

export function useConversationList() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiClient.get<{ conversations: ConversationSummary[] }>('/api/conversations'),
  })
}

export function useConversationMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['conversations', conversationId, 'messages'],
    queryFn: () => apiClient.get<{ messages: Message[] }>(`/api/conversations/${conversationId}`),
    enabled: !!conversationId,
    // Never retry a 404 — the conversation either exists or it doesn't. Retrying
    // just delays the "not found" UI for ~7 seconds for no value. Preserve the
    // default retry behavior for other error classes (network, 5xx).
    retry: (count, err) => {
      const status = (err as { status?: number })?.status
      if (status === 404) return false
      return count < 3
    },
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) =>
      apiClient.delete<{ success: boolean }>(`/api/conversations/${conversationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export function useUpdateConversationTitle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiClient.patch<{ success: boolean }>(`/api/conversations/${id}`, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

/**
 * Toggle the starred flag on a conversation with optimistic updates. Writes
 * 1 | 0 immediately to the cached list so the row reorders under the cursor,
 * then reconciles against the server response.
 */
interface StarResponse {
  success: boolean
  starred: boolean
}

interface StarContext {
  prev?: { conversations: ConversationSummary[] }
}

export function useStarConversation() {
  const queryClient = useQueryClient()
  return useMutation<StarResponse, Error, { id: string; starred: boolean }, StarContext>({
    mutationFn: ({ id, starred }) =>
      starred
        ? apiClient.post<StarResponse>(`/api/conversations/${id}/star`, {})
        : apiClient.delete<StarResponse>(`/api/conversations/${id}/star`),
    onMutate: async ({ id, starred }) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] })
      const prev = queryClient.getQueryData<{ conversations: ConversationSummary[] }>([
        'conversations',
      ])
      if (prev) {
        queryClient.setQueryData(['conversations'], {
          conversations: prev.conversations.map((c) =>
            c.id === id ? { ...c, starred: starred ? 1 : 0 } : c
          ),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['conversations'], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}
