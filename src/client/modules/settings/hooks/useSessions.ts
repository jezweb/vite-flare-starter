import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

interface SessionInfo {
  id: string
  device: string
  browser: string
  os: string
  ipAddress: string | null
  lastActive: number
  createdAt: number
  isCurrent: boolean
}

interface SessionsResponse {
  sessions: SessionInfo[]
}

/**
 * Fetch all active sessions
 */
export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () =>
      apiClient.get<SessionsResponse>('/api/settings/sessions').then((r) => r.sessions),
    staleTime: 60 * 1000, // 1 minute
  })
}

/**
 * Revoke a specific session
 */
export function useRevokeSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) =>
      apiClient.delete<{ success: boolean }>(`/api/settings/sessions/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

/**
 * Revoke all sessions except current
 */
export function useRevokeAllSessions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiClient.delete<{ success: boolean }>('/api/settings/sessions'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export type { SessionInfo }
