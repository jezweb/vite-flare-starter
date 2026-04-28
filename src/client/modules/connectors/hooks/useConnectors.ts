import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import type { CatalogEntry } from '@/shared/config/connector-catalog'

export interface McpConnection {
  id: string
  connectorId: string
  displayName: string
  url: string
  transport: 'http' | 'sse'
  authType: 'oauth' | 'bearer' | 'none'
  status: 'active' | 'pending' | 'error' | 'revoked'
  lastError: string | null
  scope: string | null
  hasAccessToken: boolean
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  /** Slice 9 — Connection Profiles. Short label the user picks
   *  ("personal", "work"); shows in the routine setup wizard. */
  personalityLabel: string | null
  /** Agent NAMES that may use this connection. Empty / null = available
   *  to any agent. */
  allowedAgentNames: string[] | null
}

export interface UpdateProfileInput {
  personalityLabel?: string | null
  allowedAgentNames?: string[] | null
}

export function useUpdateConnectionProfile(connectionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: UpdateProfileInput) =>
      apiClient.patch(`/api/mcp-connections/${connectionId}/profile`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-connections'] })
    },
  })
}

export function useConnections() {
  return useQuery({
    queryKey: ['mcp-connections'],
    queryFn: () => apiClient.get<{ connections: McpConnection[] }>('/api/mcp-connections'),
    staleTime: 10_000,
  })
}

export function useCatalog() {
  return useQuery({
    queryKey: ['mcp-catalog'],
    queryFn: () => apiClient.get<{ catalog: CatalogEntry[] }>('/api/mcp-connections/catalog'),
    staleTime: 60_000 * 5,
  })
}

export interface ConnectInput {
  connectorId: string
  displayName?: string
  url?: string
}

export interface ConnectResponse {
  connectionId: string
  authType: 'oauth' | 'bearer' | 'none'
  status: string
  authorizationUrl?: string
}

export function useConnect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ConnectInput) =>
      apiClient.post<ConnectResponse>('/api/mcp-connections/connect', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-connections'] })
    },
  })
}

export function useDisconnect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<{ success: boolean }>(`/api/mcp-connections/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-connections'] })
    },
  })
}

export function useSaveBearer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) =>
      apiClient.post<{ success: boolean }>(`/api/mcp-connections/${id}/bearer`, { token }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-connections'] })
    },
  })
}

export interface ConnectionTool {
  name: string
  description: string | null
  policy: 'always' | 'ask' | 'never'
}

export function useConnectionTools(connectionId: string | null) {
  return useQuery({
    queryKey: ['mcp-connections', connectionId, 'tools'],
    queryFn: () =>
      apiClient.get<{ tools: ConnectionTool[] }>(`/api/mcp-connections/${connectionId}/tools`),
    enabled: !!connectionId,
  })
}

export function useUpdateToolPolicies() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      connectionId,
      policies,
    }: {
      connectionId: string
      policies: Array<{ toolName: string; policy: 'always' | 'ask' | 'never' }>
    }) =>
      apiClient.put<{ success: boolean; count: number }>(
        `/api/mcp-connections/${connectionId}/tool-policies`,
        { policies },
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['mcp-connections', vars.connectionId, 'tools'] })
    },
  })
}

export function useProbeMcp() {
  return useMutation({
    mutationFn: (url: string) =>
      apiClient.post<{
        authType: 'oauth' | 'bearer' | 'none'
        authorizationEndpoint?: string
        tokenEndpoint?: string
        error?: string
      }>('/api/mcp-connections/probe', { url }),
  })
}

/**
 * Re-issue an OAuth authorization URL for a pending connection. Used by the
 * Resume flow when the popup was blocked or closed mid-handshake (Cn3 fix).
 */
export function useAuthorizeConnection() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ authorizationUrl: string }>(
        `/api/mcp-connections/${id}/authorize`,
        {},
      ),
  })
}
