/**
 * Projects — TanStack Query hooks.
 *
 * Mirrors the server contract in src/server/modules/projects/routes.ts.
 * Kept separate from the conversations hooks because projects are a
 * standalone entity with their own page (Phase 2) and lifecycle.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export interface Project {
  id: string
  name: string
  description: string | null
  systemPrompt: string | null
  defaultModel: string | null
  color: string | null
  position: number
  archived: number
  conversationCount?: number
  createdAt: string | null
  updatedAt: string | null
}

interface ListResponse {
  projects: Project[]
}

export function useProjectList() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => apiClient.get<ListResponse>('/api/projects'),
  })
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['projects', projectId],
    queryFn: () =>
      apiClient.get<{ project: Project; conversations: unknown[] }>(
        `/api/projects/${projectId}`,
      ),
    enabled: !!projectId,
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      name: string
      description?: string
      systemPrompt?: string
      defaultModel?: string
      color?: string
    }) => apiClient.post<{ id: string; success: boolean }>('/api/projects', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string
      name?: string
      description?: string | null
      systemPrompt?: string | null
      defaultModel?: string | null
      color?: string | null
      position?: number
    }) => apiClient.patch<{ success: boolean }>(`/api/projects/${id}`, patch),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects', vars.id] })
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<{ success: boolean }>(`/api/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      // Conversations may have been released back to "ungrouped" via the
      // ON DELETE SET NULL FK — refresh their list too.
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

/**
 * Move a conversation into or out of a project. Pass `projectId: null` to
 * remove the grouping. Optimistically updates the conversations list so the
 * row re-buckets immediately in the sidebar.
 */
interface MoveContext {
  prev?: { conversations: Array<{ id: string; projectId: string | null; [k: string]: unknown }> }
}

export function useMoveConversation() {
  const queryClient = useQueryClient()
  return useMutation<
    { success: boolean },
    Error,
    { id: string; projectId: string | null },
    MoveContext
  >({
    mutationFn: ({ id, projectId }) =>
      apiClient.patch<{ success: boolean }>(`/api/conversations/${id}`, { projectId }),
    onMutate: async ({ id, projectId }) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] })
      const prev = queryClient.getQueryData<MoveContext['prev']>(['conversations'])
      if (prev) {
        queryClient.setQueryData(['conversations'], {
          conversations: prev.conversations.map((c) =>
            c.id === id ? { ...c, projectId } : c,
          ),
        })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['conversations'], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
