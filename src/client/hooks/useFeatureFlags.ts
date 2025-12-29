/**
 * Feature Flags Hook
 *
 * Fetches feature flags from the API for runtime feature toggling.
 */

import { useQuery } from '@tanstack/react-query'

interface FeatureFlagsResponse {
  features: Record<string, boolean>
}

/**
 * Fetch feature flags from the public API
 */
async function fetchFeatureFlags(): Promise<Record<string, boolean>> {
  const response = await fetch('/api/features')
  if (!response.ok) {
    throw new Error('Failed to fetch feature flags')
  }
  const data: FeatureFlagsResponse = await response.json()
  return data.features
}

/**
 * Hook to access feature flags
 *
 * @example
 * const { features, isEnabled, isLoading } = useFeatureFlags()
 *
 * // Check if a feature is enabled
 * if (isEnabled('tasks')) {
 *   // Show tasks feature
 * }
 */
export function useFeatureFlags() {
  const query = useQuery({
    queryKey: ['feature-flags'],
    queryFn: fetchFeatureFlags,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  })

  const isEnabled = (key: string): boolean => {
    if (!query.data) return true // Default to enabled if not loaded
    return query.data[key] ?? true // Default to enabled if not in flags
  }

  return {
    features: query.data ?? {},
    isEnabled,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
