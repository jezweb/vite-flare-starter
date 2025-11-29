/**
 * Organization Settings Hooks
 *
 * TanStack Query hooks for fetching and updating organization settings
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { OrganizationSettings } from '@/server/modules/organization/db/schema'
import type { UpdateOrganizationInput } from '@/shared/schemas/organization.schema'

const API_BASE = '/api/organization'

// Query keys
const ORGANIZATION_KEYS = {
  all: ['organization'] as const,
  settings: () => [...ORGANIZATION_KEYS.all, 'settings'] as const,
}

interface OrganizationResponse {
  organization: OrganizationSettings
}

interface UpdateOrganizationResponse {
  message: string
  organization: OrganizationSettings
}

/**
 * Fetch organization settings
 */
export function useOrganization() {
  return useQuery({
    queryKey: ORGANIZATION_KEYS.settings(),
    queryFn: async (): Promise<OrganizationSettings> => {
      const response = await fetch(API_BASE, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch organization settings')
      }

      const data: OrganizationResponse = await response.json()
      return data.organization
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Update organization settings
 */
export function useUpdateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateOrganizationInput): Promise<OrganizationSettings> => {
      const response = await fetch(API_BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const errorData: any = await response.json()
        throw new Error(errorData.error || 'Failed to update organization settings')
      }

      const data: UpdateOrganizationResponse = await response.json()
      return data.organization
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORGANIZATION_KEYS.settings() })
    },
  })
}
