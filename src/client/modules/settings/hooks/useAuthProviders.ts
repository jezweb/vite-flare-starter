import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

interface AuthProvidersResponse {
  providers: string[]
  hasPassword: boolean
}

/**
 * Fetch which better-auth providers back the current account. The Security
 * tab uses `hasPassword` to decide whether to render the Change Password
 * form — OAuth-only users can't change a password they don't have.
 */
export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => apiClient.get<AuthProvidersResponse>('/api/settings/auth-providers'),
    staleTime: 5 * 60 * 1000, // providers rarely change mid-session
  })
}
