/**
 * Access-log hook — admin cross-user activity feed.
 * Backed by GET /api/admin/access-log (auth + admin gated server-side).
 */
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export interface AccessLogEntry {
  id: string
  userId: string
  action: string
  entityType: string
  entityId: string
  entityName: string | null
  changes: Record<string, { old: unknown; new: unknown }> | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  actor: { name: string | null; email: string } | null
}

export interface AccessLogResponse {
  entries: AccessLogEntry[]
  limit: number
  offset: number
  count: number
}

export interface AccessLogFilters {
  userId?: string
  action?: string
  entityType?: string
  from?: number
  to?: number
  limit?: number
  offset?: number
}

export function useAccessLog(filters: AccessLogFilters = {}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return useQuery({
    queryKey: ['admin', 'access-log', filters],
    queryFn: () => apiClient.get<AccessLogResponse>(`/api/admin/access-log${qs ? `?${qs}` : ''}`),
  })
}
