/**
 * Feature Flags Hooks
 *
 * TanStack Query hooks for feature flag management.
 * - usePublicFeatures: Public API, cached for menu filtering
 * - useAdminFeatures: Admin API, full metadata
 * - useToggleFeature: Mutation to toggle feature state
 * - useSyncFeatures: Mutation to sync features from defaults
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ToggleFeatureInput } from '@/shared/schemas/feature-flags.schema'

// =============================================================================
// Types
// =============================================================================

export interface PublicFeaturesResponse {
  features: Record<string, boolean>
}

export interface FeatureFlag {
  key: string
  name: string
  description: string | null
  category: 'core' | 'crm' | 'communication' | 'content' | 'development'
  enabled: boolean
  icon: string | null
  menuPath: string | null
  sortOrder: number
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminFeaturesResponse {
  features: FeatureFlag[]
}

// =============================================================================
// Query Keys
// =============================================================================

const FEATURES_KEYS = {
  all: ['features'] as const,
  public: () => [...FEATURES_KEYS.all, 'public'] as const,
  admin: () => [...FEATURES_KEYS.all, 'admin'] as const,
  detail: (key: string) => [...FEATURES_KEYS.admin(), key] as const,
}

// =============================================================================
// Public Hooks
// =============================================================================

/**
 * Fetch public features map (for menu filtering)
 * Cached for 5 minutes, stale after 1 minute
 */
export function usePublicFeatures() {
  return useQuery({
    queryKey: FEATURES_KEYS.public(),
    queryFn: async (): Promise<PublicFeaturesResponse> => {
      const response = await fetch('/api/features', {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch features')
      }

      return response.json()
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Get enabled features as a Set for easy checking
 */
export function useEnabledFeatures() {
  const { data, ...rest } = usePublicFeatures()

  const enabledFeatures = new Set<string>(
    Object.entries(data?.features ?? {})
      .filter(([, enabled]) => enabled)
      .map(([key]) => key)
  )

  return {
    enabledFeatures,
    isFeatureEnabled: (key: string) => enabledFeatures.has(key),
    ...rest,
  }
}

// =============================================================================
// Admin Hooks
// =============================================================================

/**
 * Fetch all features with full metadata (admin only)
 */
export function useAdminFeatures() {
  return useQuery({
    queryKey: FEATURES_KEYS.admin(),
    queryFn: async (): Promise<FeatureFlag[]> => {
      const response = await fetch('/api/admin/feature-flags', {
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Unauthorized')
        }
        throw new Error('Failed to fetch features')
      }

      const data = (await response.json()) as AdminFeaturesResponse
      return data.features
    },
  })
}

/**
 * Toggle feature enabled state
 */
export function useToggleFeature() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      key,
      enabled,
    }: {
      key: string
      enabled: boolean
    }): Promise<FeatureFlag> => {
      const response = await fetch(`/api/admin/feature-flags/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled } satisfies ToggleFeatureInput),
      })

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string }
        throw new Error(errorData.error || 'Failed to toggle feature')
      }

      const data = (await response.json()) as { feature: FeatureFlag }
      return data.feature
    },
    onSuccess: () => {
      // Invalidate both public and admin feature queries
      queryClient.invalidateQueries({ queryKey: FEATURES_KEYS.all })
    },
  })
}

/**
 * Sync features from default set (creates missing features)
 */
export function useSyncFeatures() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<{
      message: string
      created: number
      features?: string[]
    }> => {
      const response = await fetch('/api/admin/feature-flags/sync', {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string }
        throw new Error(errorData.error || 'Failed to sync features')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEATURES_KEYS.all })
    },
  })
}

/**
 * Delete a feature
 */
export function useDeleteFeature() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (key: string): Promise<void> => {
      const response = await fetch(`/api/admin/feature-flags/${key}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string }
        throw new Error(errorData.error || 'Failed to delete feature')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEATURES_KEYS.all })
    },
  })
}
