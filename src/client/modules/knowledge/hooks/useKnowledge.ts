/**
 * Knowledge — TanStack Query hooks for the knowledge module API.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export type KnowledgeScope = 'user' | 'project' | 'org'
export type KnowledgeFormat = 'markdown' | 'json' | 'text'
export type InjectionMode = 'always' | 'on_demand' | 'disabled'

export interface KnowledgeRow {
  id: string
  scope: KnowledgeScope
  scopeId: string
  title: string
  summary: string
  /** Omitted by /api/knowledge list endpoint by default; present on /:id detail. */
  body?: string
  format: KnowledgeFormat
  injectionMode: InjectionMode
  tags: string[]
  estimatedTokens: number
  createdAt: string | null
  updatedAt: string | null
}

export interface CreateKnowledgeBody {
  scope: KnowledgeScope
  scopeId: string
  title: string
  summary: string
  body: string
  format?: KnowledgeFormat
  injectionMode?: InjectionMode
  tags?: string[]
}

export type UpdateKnowledgeBody = Partial<Omit<CreateKnowledgeBody, 'scope' | 'scopeId'>>

export function useKnowledgeList(scope: KnowledgeScope, scopeId: string | null | undefined, opts?: { injectionMode?: InjectionMode }) {
  return useQuery({
    queryKey: ['knowledge', scope, scopeId, opts?.injectionMode ?? null],
    enabled: !!scopeId,
    queryFn: () => {
      const params = new URLSearchParams({ scope, scopeId: scopeId ?? '' })
      if (opts?.injectionMode) params.set('injectionMode', opts.injectionMode)
      return apiClient.get<{ knowledge: KnowledgeRow[]; count: number }>(
        `/api/knowledge?${params.toString()}`,
      )
    },
  })
}

export function useKnowledge(id: string | null | undefined) {
  return useQuery({
    queryKey: ['knowledge', 'detail', id],
    enabled: !!id,
    queryFn: () => apiClient.get<{ knowledge: KnowledgeRow }>(`/api/knowledge/${id}`),
  })
}

export function useKnowledgeBudget() {
  return useQuery({
    queryKey: ['knowledge', 'budget'],
    queryFn: () =>
      apiClient.get<{
        total: number
        count: number
        entries: { id: string; title: string; scope: KnowledgeScope; estimatedTokens: number }[]
      }>('/api/knowledge/budget'),
  })
}

export function useKnowledgeSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ['knowledge', 'search', query],
    enabled: enabled && query.trim().length > 0,
    queryFn: () =>
      apiClient.get<{
        hits: {
          id: string
          title: string
          summary: string
          scope: KnowledgeScope
          tags: string[]
          estimatedTokens: number
          rank: number
        }[]
        count: number
      }>(`/api/knowledge/search?q=${encodeURIComponent(query)}`),
  })
}

export function useCreateKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateKnowledgeBody) =>
      apiClient.post<{ knowledge: KnowledgeRow }>('/api/knowledge', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['knowledge'] })
    },
  })
}

export function useUpdateKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateKnowledgeBody }) =>
      apiClient.patch<{ knowledge: KnowledgeRow }>(`/api/knowledge/${id}`, body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['knowledge'] })
      void qc.invalidateQueries({ queryKey: ['knowledge', 'detail', vars.id] })
    },
  })
}

export function useDeleteKnowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<{ ok: boolean }>(`/api/knowledge/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['knowledge'] })
    },
  })
}
