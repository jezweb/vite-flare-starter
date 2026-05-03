/**
 * Agent instances — TanStack Query hooks.
 *
 * Mirrors `src/server/modules/agent-instances/routes.ts`. Each hook is
 * a thin wrapper over `apiClient` with a tagged queryKey so mutations
 * can invalidate cleanly.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export interface AgentInstanceState {
  name: string
  persona: string
  userId: string | null
  modelId: string
  dailyBudgetUsd: number | null
  blockCount: number
  blockNames: string[]
  historyCount: number
  invocations: number
  lastActiveAt: number | null
  createdAt: number
}

export interface AgentInstanceSummary {
  agentClass: string
  agentName: string
  displayName: string
  description: string
  /**
   * One-line "use this when…" written for the user. Falls back to
   * `description` server-side when the agent's metadata doesn't define
   * it. Surface this on dormant cards + in the type picker so a non-
   * technical user can decide which agent fits their need.
   */
  userPurpose?: string
  category: string
  runs: number
  totalCostUsd: number | null
  lastRunAt: number
  state: AgentInstanceState | null
  stateError?: string
  /** True for registered classes with no active instance yet. Click to
   *  wake — the edit sheet's save calls setOwner which creates the DO. */
  dormant: boolean
}

interface ListResponse {
  total: number
  instances: AgentInstanceSummary[]
}

export function useAgentInstances() {
  return useQuery<ListResponse>({
    queryKey: ['agent-instances'],
    queryFn: () => apiClient.get<ListResponse>('/api/agent-instances'),
    refetchInterval: 60_000,
  })
}

interface OneResponse {
  agentClass: string
  agentName: string
  state: AgentInstanceState
  metadata: {
    className: string
    displayName: string
    description: string
    category: string
  } | null
}

export function useAgentInstance(agentClass: string | null, agentName: string | null) {
  return useQuery<OneResponse>({
    queryKey: ['agent-instances', agentClass, agentName],
    queryFn: () =>
      apiClient.get<OneResponse>(`/api/agent-instances/${agentClass}/${agentName}`),
    enabled: !!agentClass && !!agentName,
  })
}

export interface AgentInstancePatch {
  persona?: string
  modelId?: string
  dailyBudgetUsd?: number | null
}

export function useUpdateAgentInstance(agentClass: string, agentName: string) {
  const qc = useQueryClient()
  return useMutation<{ ok: true; state: AgentInstanceState }, Error, AgentInstancePatch>({
    mutationFn: (patch) =>
      apiClient.patch<{ ok: true; state: AgentInstanceState }>(
        `/api/agent-instances/${agentClass}/${agentName}`,
        patch,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-instances'] })
    },
  })
}

interface RegisteredAgent {
  className: string
  displayName: string
  description: string
  category: string
}

interface RegisteredResponse {
  agents: RegisteredAgent[]
}

export function useRegisteredAgents() {
  return useQuery<RegisteredResponse>({
    queryKey: ['agents', 'registered'],
    queryFn: () => apiClient.get<RegisteredResponse>('/api/agents/registered'),
    staleTime: 5 * 60_000,
  })
}
