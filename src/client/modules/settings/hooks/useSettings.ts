import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/client/lib/auth'
import { apiClient } from '@/client/lib/api-client'
import { queryKeys } from '@/client/lib/query-keys'
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
 * Uses centralised apiClient and query key factory.
 */

const API_BASE = '/api/settings'

interface SuccessResponse {
  message: string
  user?: Record<string, unknown>
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
    mutationFn: (input: UpdateNameInput) =>
      apiClient.patch<SuccessResponse>(`${API_BASE}/profile`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session })
    },
  })
}

/**
 * Change user email (triggers verification flow)
 */
export function useChangeEmail() {
  return useMutation({
    mutationFn: (input: ChangeEmailInput) =>
      apiClient.post<EmailChangeResponse>(`${API_BASE}/email`, input),
  })
}

/**
 * Change user password
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiClient.post<SuccessResponse>(`${API_BASE}/password`, input),
  })
}

/**
 * Delete user account (permanent action)
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: DeleteAccountInput) =>
      apiClient.delete<DeleteAccountResponse>(`${API_BASE}/account`, {
        body: input,
      }),
    onSuccess: () => {
      queryClient.clear()
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
    queryKey: queryKeys.settings.preferences(),
    queryFn: async (): Promise<UserPreferences> => {
      const data = await apiClient.get<PreferencesResponse>(`${API_BASE}/preferences`)
      return data.preferences
    },
    enabled: !!session?.user,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Update user preferences (theme, mode)
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UserPreferences) =>
      apiClient.patch<UpdatePreferencesResponse>(`${API_BASE}/preferences`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.preferences() })
    },
  })
}

/**
 * Hook to get current user session data
 * Re-exports from better-auth for convenience
 */
export { useSession }
