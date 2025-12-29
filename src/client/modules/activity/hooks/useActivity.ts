/**
 * Activity Hooks
 *
 * TanStack Query hooks for activity log management.
 */

import { useQuery } from '@tanstack/react-query'

// =============================================================================
// Types
// =============================================================================

export interface Activity {
  id: string
  userId: string
  action: 'create' | 'update' | 'delete' | 'archive' | 'restore' | 'import' | 'export' | 'assign' | 'unassign' | 'view' | 'convert'
  entityType: string
  entityId: string
  entityName: string | null
  changes: string | null
  metadata: string | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  userName: string | null
  userEmail: string | null
}

export interface ActivitiesResponse {
  activities: Activity[]
  count: number
  hasMore: boolean
}

export interface ActivityStats {
  total: number
  today: number
  thisWeek: number
  byEntityType: Record<string, number>
  byAction: Record<string, number>
}

export interface ActivityQueryParams {
  entityType?: string
  entityId?: string
  action?: Activity['action']
  limit?: number
  offset?: number
}

// =============================================================================
// Query Keys
// =============================================================================

const ACTIVITY_KEYS = {
  all: ['activity'] as const,
  list: (params?: ActivityQueryParams) => [...ACTIVITY_KEYS.all, 'list', params] as const,
  recent: () => [...ACTIVITY_KEYS.all, 'recent'] as const,
  stats: () => [...ACTIVITY_KEYS.all, 'stats'] as const,
  entity: (entityType: string, entityId: string) =>
    [...ACTIVITY_KEYS.all, 'entity', entityType, entityId] as const,
}

// =============================================================================
// Queries
// =============================================================================

/**
 * Fetch activities with filtering and pagination
 */
export function useActivities(params?: ActivityQueryParams) {
  return useQuery({
    queryKey: ACTIVITY_KEYS.list(params),
    queryFn: async (): Promise<ActivitiesResponse> => {
      const searchParams = new URLSearchParams()
      if (params?.entityType) searchParams.set('entityType', params.entityType)
      if (params?.entityId) searchParams.set('entityId', params.entityId)
      if (params?.action) searchParams.set('action', params.action)
      if (params?.limit) searchParams.set('limit', params.limit.toString())
      if (params?.offset) searchParams.set('offset', params.offset.toString())

      const response = await fetch(`/api/activity?${searchParams}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch activities')
      }

      return response.json()
    },
  })
}

/**
 * Fetch recent activities (last 10)
 */
export function useRecentActivities() {
  return useQuery({
    queryKey: ACTIVITY_KEYS.recent(),
    queryFn: async (): Promise<{ activities: Activity[] }> => {
      const response = await fetch('/api/activity/recent', {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch recent activities')
      }

      return response.json()
    },
    staleTime: 30 * 1000, // 30 seconds
  })
}

/**
 * Fetch activity statistics
 */
export function useActivityStats() {
  return useQuery({
    queryKey: ACTIVITY_KEYS.stats(),
    queryFn: async (): Promise<ActivityStats> => {
      const response = await fetch('/api/activity/stats', {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch activity stats')
      }

      return response.json()
    },
    staleTime: 60 * 1000, // 1 minute
  })
}

/**
 * Fetch activity for a specific entity
 */
export function useEntityActivity(entityType: string, entityId: string, limit = 20) {
  return useQuery({
    queryKey: ACTIVITY_KEYS.entity(entityType, entityId),
    queryFn: async (): Promise<{ activities: Activity[] }> => {
      const response = await fetch(
        `/api/activity/entity/${entityType}/${entityId}?limit=${limit}`,
        {
          credentials: 'include',
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch entity activity')
      }

      return response.json()
    },
    enabled: !!entityType && !!entityId,
  })
}
