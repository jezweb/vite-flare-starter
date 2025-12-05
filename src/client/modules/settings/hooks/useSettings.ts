import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/client/lib/auth'
import type {
  UpdateNameInput,
  ChangeEmailInput,
  ChangePasswordInput,
  DeleteAccountInput,
} from '@/shared/schemas/settings.schema'
import type { UserPreferences } from '@/shared/schemas/preferences.schema'

/**
 * TanStack Query hooks for user settings
 *
 * Provides mutations for profile, email, password, and account deletion
 */

// Base URL for API requests (relative to current origin)
const API_BASE = '/api/settings'

// API response types
interface SuccessResponse {
  message: string
  user?: any
}

interface EmailChangeResponse {
  message: string
  requiresVerification: boolean
}

interface DeleteAccountResponse {
  message: string
  success: boolean
}

interface PreferencesResponse {
  preferences: UserPreferences
}

interface UpdatePreferencesResponse {
  message: string
  preferences: UserPreferences
}

/**
 * Update user profile (name, image)
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateNameInput): Promise<SuccessResponse> => {
      const response = await fetch(`${API_BASE}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const errorData: any = await response.json()
        throw new Error(errorData.error || 'Failed to update profile')
      }

      return response.json()
    },
    onSuccess: () => {
      // Invalidate auth session to refetch updated user data
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

/**
 * Change user email (triggers verification flow)
 */
export function useChangeEmail() {
  return useMutation({
    mutationFn: async (
      input: ChangeEmailInput
    ): Promise<EmailChangeResponse> => {
      const response = await fetch(`${API_BASE}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const errorData: any = await response.json()
        throw new Error(errorData.error || 'Failed to change email')
      }

      return response.json()
    },
  })
}

/**
 * Change user password
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (
      input: ChangePasswordInput
    ): Promise<SuccessResponse> => {
      const response = await fetch(`${API_BASE}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const errorData: any = await response.json()
        throw new Error(errorData.error || 'Failed to change password')
      }

      return response.json()
    },
  })
}

/**
 * Delete user account (permanent action)
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      input: DeleteAccountInput
    ): Promise<DeleteAccountResponse> => {
      const response = await fetch(`${API_BASE}/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const errorData: any = await response.json()
        throw new Error(errorData.error || 'Failed to delete account')
      }

      return response.json()
    },
    onSuccess: () => {
      // Clear all cached data
      queryClient.clear()
      // Redirect to home page will be handled by component
    },
  })
}

/**
 * Fetch user preferences (theme, mode)
 * Only fetches when user is authenticated to prevent 401s on public pages
 */
export function usePreferences() {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['preferences'],
    queryFn: async (): Promise<UserPreferences> => {
      const response = await fetch(`${API_BASE}/preferences`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch preferences')
      }

      const data: PreferencesResponse = await response.json()
      return data.preferences
    },
    enabled: !!session?.user, // Only fetch when logged in
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Update user preferences (theme, mode)
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      input: UserPreferences
    ): Promise<UpdatePreferencesResponse> => {
      const response = await fetch(`${API_BASE}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const errorData: any = await response.json()
        throw new Error(errorData.error || 'Failed to update preferences')
      }

      return response.json()
    },
    onSuccess: () => {
      // Invalidate preferences query to refetch
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
    },
  })
}

/**
 * Hook to get current user session data
 * Re-exports from better-auth for convenience
 */
export { useSession }
