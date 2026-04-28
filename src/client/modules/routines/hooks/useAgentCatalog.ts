/**
 * Catalog hooks for the routine setup wizard pickers — agents + tools.
 * Skills come from the existing useSkillSummary hook.
 */
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export interface RegisteredAgent {
  className: string
  displayName: string
  description: string
  category: string
  icon?: string
}

export interface CatalogTool {
  name: string
  description: string
  category: string
}

export function useAgentCatalog() {
  return useQuery({
    queryKey: ['agents', 'registered'],
    queryFn: () => apiClient.get<{ agents: RegisteredAgent[] }>('/api/agents/registered'),
    staleTime: 60 * 60 * 1000, // 1 hour — registry is static per deploy
  })
}

export function useToolsCatalog() {
  return useQuery({
    queryKey: ['agent-tools', 'catalog'],
    queryFn: () => apiClient.get<{ tools: CatalogTool[] }>('/api/chat/catalog'),
    staleTime: 5 * 60 * 1000,
  })
}
