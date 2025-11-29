import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateApiTokenInput, ApiTokenCreated, ApiTokenListItem } from '@/shared/schemas/api-token.schema'

/**
 * TanStack Query hooks for API tokens
 *
 * Provides data fetching and mutations for managing API tokens
 * used for external API access (e.g., ElevenLabs agents)
 */

// Base URL for API requests (relative to current origin)
const API_BASE = '/api/api-tokens'

// Query keys for cache management
const API_TOKENS_KEYS = {
  all: ['api-tokens'] as const,
  lists: () => [...API_TOKENS_KEYS.all, 'list'] as const,
  list: () => [...API_TOKENS_KEYS.lists()] as const,
}

// API response types
interface ApiTokensResponse {
  tokens: ApiTokenListItem[]
}

interface ApiTokenCreateResponse {
  token: ApiTokenCreated
}

interface DeleteResponse {
  success: boolean
}

interface ErrorResponse {
  error?: string
}

/**
 * Fetch all API tokens for the current user
 */
export function useApiTokens() {
  return useQuery({
    queryKey: API_TOKENS_KEYS.list(),
    queryFn: async (): Promise<ApiTokenListItem[]> => {
      const response = await fetch(API_BASE, {
        credentials: 'include', // Include cookies for auth
      })

      if (!response.ok) {
        throw new Error('Failed to fetch API tokens')
      }

      const data: ApiTokensResponse = await response.json()
      return data.tokens
    },
  })
}

/**
 * Create a new API token
 * Returns the full token (only shown once!)
 */
export function useCreateApiToken() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateApiTokenInput): Promise<ApiTokenCreated> => {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const errorData: ErrorResponse = await response.json()
        throw new Error(errorData.error || 'Failed to create API token')
      }

      const data: ApiTokenCreateResponse = await response.json()
      return data.token
    },
    onSuccess: () => {
      // Invalidate tokens list to trigger refetch
      queryClient.invalidateQueries({ queryKey: API_TOKENS_KEYS.list() })
    },
  })
}

/**
 * Delete an API token
 */
export function useDeleteApiToken() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData: ErrorResponse = await response.json()
        throw new Error(errorData.error || 'Failed to delete API token')
      }

      const data: DeleteResponse = await response.json()
      if (!data.success) {
        throw new Error('Delete operation failed')
      }
    },
    onSuccess: () => {
      // Invalidate tokens list to trigger refetch
      queryClient.invalidateQueries({ queryKey: API_TOKENS_KEYS.list() })
    },
  })
}
