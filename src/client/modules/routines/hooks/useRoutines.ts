/**
 * Routines hooks — TanStack Query wrappers around /api/routines.
 *
 * Single source of truth for routine cache keys + invalidation; pages
 * import these directly so the components stay free of fetch plumbing.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export interface Routine {
  id: string
  userId: string
  name: string
  description: string | null
  agentClass: string
  agentName: string
  triggerKind: 'schedule' | 'webhook' | 'event' | 'manual'
  triggerConfigJson: string | null
  inputTemplateJson: string | null
  toolsAllowedJson: string | null
  skillsLoadedJson: string | null
  hooksJson: string | null
  enabled: boolean
  baseInterval: number | null
  minInterval: number | null
  maxInterval: number | null
  effectiveInterval: number | null
  adjustMode: 'direct' | 'suggested' | 'fixed'
  dailyBudgetUsd: number | null
  createdAt: number
  updatedAt: number
  lastRunAt: number | null
  lastOutcome: 'started' | 'ok' | 'error' | 'budget_exceeded' | null
}

export interface RoutineRun {
  id: string
  routineId: string
  agentRunId: string | null
  runNumber: number
  startedAt: number
  finishedAt: number | null
  inputContextSummary: string | null
  outputSummary: string | null
  outcome: 'started' | 'ok' | 'error' | 'budget_exceeded'
  costUsd: number | null
}

const KEYS = {
  all: ['routines'] as const,
  list: () => [...KEYS.all, 'list'] as const,
  detail: (id: string) => [...KEYS.all, 'detail', id] as const,
  runs: (id: string) => [...KEYS.all, 'runs', id] as const,
}

export function useRoutines() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: () => apiClient.get<{ total: number; routines: Routine[] }>('/api/routines'),
    refetchInterval: 30_000,
  })
}

export function useRoutine(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : ['routines', 'detail', 'none'],
    queryFn: () => apiClient.get<Routine>(`/api/routines/${id}`),
    enabled: !!id,
    refetchInterval: 30_000,
  })
}

export function useRoutineRuns(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.runs(id) : ['routines', 'runs', 'none'],
    queryFn: () => apiClient.get<{ total: number; runs: RoutineRun[] }>(`/api/routines/${id}/runs`),
    enabled: !!id,
    refetchInterval: 15_000,
  })
}

export interface CreateRoutineInput {
  name: string
  description?: string
  agentClass: string
  agentName: string
  triggerKind?: 'schedule' | 'webhook' | 'event' | 'manual'
  triggerConfig?: unknown
  inputTemplate?: { input?: string }
  toolsAllowed?: string[]
  skillsLoaded?: string[]
  hooks?: Record<string, string>
  baseInterval?: number
  minInterval?: number
  maxInterval?: number
  adjustMode?: 'direct' | 'suggested' | 'fixed'
  dailyBudgetUsd?: number | null
  enabled?: boolean
}

export function useCreateRoutine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRoutineInput) => apiClient.post<Routine>('/api/routines', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.all }),
  })
}

export function useUpdateRoutine(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<CreateRoutineInput>) =>
      apiClient.patch<Routine>(`/api/routines/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.all }),
  })
}

export function useDeleteRoutine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/routines/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.all }),
  })
}

export function useFireRoutine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/routines/${id}/fire`, {}),
    onSuccess: (_, id) => {
      // Invalidate runs immediately so the new run row appears
      queryClient.invalidateQueries({ queryKey: KEYS.runs(id) })
      queryClient.invalidateQueries({ queryKey: KEYS.detail(id) })
    },
  })
}
