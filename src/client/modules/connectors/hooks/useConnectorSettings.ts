/**
 * Per-provider connector settings hooks.
 *
 * `useConnectorSettings(id)` reads the user's per-tool enablement +
 * master-switch for a specific provider. Returns defaults if no row
 * exists server-side yet (first-time users).
 *
 * `useUpdateConnectorSettings(id)` upserts partial changes and
 * invalidates both the settings query AND the chat-tools catalog so
 * the next message picks up the new set.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export interface ConnectorSettings {
  connectorId: string
  enabled: boolean
  enabledTools: string[]
  providerDefault: boolean
  toolNames: string[]
  defaultEnabledTools: string[]
}

export function useConnectorSettings(connectorId: string | null) {
  return useQuery({
    queryKey: ['connector-settings', connectorId],
    queryFn: () => apiClient.get<ConnectorSettings>(`/api/connectors/${connectorId}/settings`),
    enabled: !!connectorId,
    staleTime: 10_000,
  })
}

export function useUpdateConnectorSettings(connectorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: { enabled?: boolean; enabledTools?: string[] }) =>
      apiClient.patch<ConnectorSettings>(`/api/connectors/${connectorId}/settings`, patch),
    onSuccess: (data) => {
      qc.setQueryData(['connector-settings', connectorId], data)
      // Chat tools catalog depends on this — invalidate so the next
      // message sees the updated allow-list.
      qc.invalidateQueries({ queryKey: ['chat', 'tools'] })
    },
  })
}
