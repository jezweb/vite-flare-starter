import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  UserListResponse,
  UserResponse,
  AdminStatsResponse,
  UpdateUserInput,
  UserListQuery,
} from '@/shared/schemas/admin.schema'

const API_BASE = '/api/admin'

// Query keys factory
const ADMIN_KEYS = {
  all: ['admin'] as const,
  users: () => [...ADMIN_KEYS.all, 'users'] as const,
  usersList: (params: Partial<UserListQuery>) => [...ADMIN_KEYS.users(), 'list', params] as const,
  user: (id: string) => [...ADMIN_KEYS.users(), 'detail', id] as const,
  stats: () => [...ADMIN_KEYS.all, 'stats'] as const,
}

/**
 * Fetch paginated user list
 */
export function useUsers(params: Partial<UserListQuery> = {}) {
  const queryParams = new URLSearchParams()
  if (params.page) queryParams.set('page', String(params.page))
  if (params.limit) queryParams.set('limit', String(params.limit))
  if (params.search) queryParams.set('search', params.search)
  if (params.sortBy) queryParams.set('sortBy', params.sortBy)
  if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder)

  return useQuery({
    queryKey: ADMIN_KEYS.usersList(params),
    queryFn: async (): Promise<UserListResponse> => {
      const url = `${API_BASE}/users?${queryParams.toString()}`
      const response = await fetch(url, {
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Admin access required')
        }
        throw new Error('Failed to fetch users')
      }
      return response.json()
    },
  })
}

/**
 * Fetch single user details
 */
export function useUser(id: string) {
  return useQuery({
    queryKey: ADMIN_KEYS.user(id),
    queryFn: async (): Promise<{ user: UserResponse }> => {
      const response = await fetch(`${API_BASE}/users/${id}`, {
        credentials: 'include',
      })
      if (!response.ok) {
        throw new Error('Failed to fetch user')
      }
      return response.json()
    },
    enabled: !!id,
  })
}

/**
 * Update a user
 */
export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateUserInput }): Promise<{ user: UserResponse }> => {
      const response = await fetch(`${API_BASE}/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || 'Failed to update user')
      }
      return response.json()
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.users() })
      queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.user(id) })
    },
  })
}

/**
 * Delete a user
 */
export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || 'Failed to delete user')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.users() })
      queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.stats() })
    },
  })
}

/**
 * Revoke all sessions for a user
 */
export function useRevokeUserSessions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await fetch(`${API_BASE}/users/${id}/revoke`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || 'Failed to revoke sessions')
      }
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.users() })
      queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.user(id) })
      queryClient.invalidateQueries({ queryKey: ADMIN_KEYS.stats() })
    },
  })
}

/**
 * Fetch admin dashboard stats
 */
export function useAdminStats() {
  return useQuery({
    queryKey: ADMIN_KEYS.stats(),
    queryFn: async (): Promise<AdminStatsResponse> => {
      const response = await fetch(`${API_BASE}/stats`, {
        credentials: 'include',
      })
      if (!response.ok) {
        throw new Error('Failed to fetch admin stats')
      }
      return response.json()
    },
  })
}
