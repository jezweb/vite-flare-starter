/**
 * useConversations — TanStack Query hooks for conversation persistence
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import type { Message } from './useChat'

interface ConversationSummary {
  id: string
  title: string | null
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
