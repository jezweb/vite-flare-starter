/**
 * Projects — TanStack Query hooks.
 *
 * Mirrors the server contract in src/server/modules/projects/routes.ts.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export interface Project {
  id: string
  orgId: string | null
  name: string
  description: string | null
  systemPrompt: string | null
  defaultModel: string | null
  color: string | null
  position: number
  starred: number
  archived: number
  archivedAt: string | null
  memoryUpdateMode: 'ask' | 'auto' | 'never'
  conversationCount?: number
  createdAt: string | null
  updatedAt: string | null
}

interface ListResponse {
  projects: Project[]
}

export interface ProjectListOptions {
  sort?: 'activity' | 'name' | 'created'
  search?: string
  includeArchived?: boolean
}

export function useProjectList(options: ProjectListOptions = {}) {
  const { sort = 'activity', search = '', includeArchived = false } = options
  const params = new URLSearchParams()
  if (sort !== 'activity') params.set('sort', sort)
  if (search) params.set('q', search)
  if (includeArchived) params.set('includeArchived', '1')
  const qs = params.toString()
  return useQuery({
    queryKey: ['projects', { sort, search, includeArchived }],
    queryFn: () => apiClient.get<ListResponse>(`/api/projects${qs ? `?${qs}` : ''}`),
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

interface CreateContext {
  prev?: { projects: Project[] }
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation<
    { id: string; success: boolean },
    Error,
    { name: string; description?: string; systemPrompt?: string; defaultModel?: string; color?: string },
    CreateContext
  >({
    mutationFn: (input) =>
      apiClient.post<{ id: string; success: boolean }>('/api/projects', input),
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
      memoryUpdateMode?: 'ask' | 'auto' | 'never'
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
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

/** Star / unstar a project. Optimistic — projects re-sort instantly. */
export function useStarProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      starred
        ? apiClient.post<{ success: boolean }>(`/api/projects/${id}/star`, {})
        : apiClient.delete<{ success: boolean }>(`/api/projects/${id}/star`),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects', vars.id] })
    },
  })
}

/** Archive / restore a project. */
export function useArchiveProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived
        ? apiClient.post<{ success: boolean }>(`/api/projects/${id}/archive`, {})
        : apiClient.delete<{ success: boolean }>(`/api/projects/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// Templates -----------------------------------------------------------------

export interface TemplateSummary {
  slug: string
  name: string
  description: string
  emoji?: string
  color?: string
  includes: string[]
}

export function useProjectTemplates() {
  return useQuery({
    queryKey: ['project-templates'],
    queryFn: () =>
      apiClient.get<{ templates: TemplateSummary[] }>('/api/projects/templates'),
    staleTime: 1000 * 60 * 60, // templates are static, cache for an hour
  })
}

export function useCreateFromTemplate() {
  const queryClient = useQueryClient()
  return useMutation<
    { id: string; success: boolean; suggestedFirstPrompts: string[] },
    Error,
    { templateSlug: string; name?: string }
  >({
    mutationFn: (input) =>
      apiClient.post<{
        id: string
        success: boolean
        suggestedFirstPrompts: string[]
      }>('/api/projects/from-template', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// AI scaffolding ------------------------------------------------------------

export interface ScaffoldDraft {
  name: string
  description: string
  systemPrompt: string
  starterMemories: Array<{
    name: string
    description: string
    content: string
    type: 'fact' | 'preference' | 'decision' | 'context' | 'reference'
  }>
  suggestedFirstPrompts: string[]
}

export function useScaffoldProject() {
  return useMutation<
    { success: boolean; draft: ScaffoldDraft },
    Error,
    { prompt: string }
  >({
    mutationFn: (input) =>
      apiClient.post<{ success: boolean; draft: ScaffoldDraft }>(
        '/api/projects/scaffold',
        input,
      ),
  })
}

export function useCreateFromScaffold() {
  const queryClient = useQueryClient()
  return useMutation<
    { id: string; success: boolean },
    Error,
    {
      name: string
      description?: string
      systemPrompt?: string
      color?: string
      starterMemories?: ScaffoldDraft['starterMemories']
    }
  >({
    mutationFn: (input) =>
      apiClient.post<{ id: string; success: boolean }>(
        '/api/projects/from-scaffold',
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// Move conversation between projects ----------------------------------------

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
