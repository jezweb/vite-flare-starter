/**
 * Notifications Hooks
 *
 * TanStack Query hooks for notification management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// =============================================================================
// Types
// =============================================================================

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  message: string | null
  data: Record<string, unknown> | null
  read: boolean
  createdAt: string
}

export interface NotificationsResponse {
  notifications: Notification[]
  count: number
  unreadCount: number
  hasMore: boolean
}

export interface UnreadCountResponse {
  count: number
}

// =============================================================================
// Query Keys
// =============================================================================

const NOTIFICATION_KEYS = {
  all: ['notifications'] as const,
  list: (params?: { limit?: number; unreadOnly?: boolean }) =>
    [...NOTIFICATION_KEYS.all, 'list', params] as const,
  unreadCount: () => [...NOTIFICATION_KEYS.all, 'unread-count'] as const,
}

// =============================================================================
// Queries
// =============================================================================

/**
 * Fetch notifications with pagination
 */
export function useNotifications(params?: { limit?: number; unreadOnly?: boolean }) {
  return useQuery({
    queryKey: NOTIFICATION_KEYS.list(params),
    queryFn: async (): Promise<NotificationsResponse> => {
      const searchParams = new URLSearchParams()
      if (params?.limit) searchParams.set('limit', params.limit.toString())
      if (params?.unreadOnly) searchParams.set('unreadOnly', 'true')

      const response = await fetch(`/api/notifications?${searchParams}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch notifications')
      }

      return response.json()
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Poll every minute
  })
}

/**
 * Fetch unread notification count only (lightweight)
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: NOTIFICATION_KEYS.unreadCount(),
    queryFn: async (): Promise<number> => {
      const response = await fetch('/api/notifications/unread-count', {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch unread count')
      }

      const data = (await response.json()) as UnreadCountResponse
      return data.count
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Poll every minute
  })
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Mark a single notification as read
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string): Promise<void> => {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to mark notification as read')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all })
    },
  })
}

/**
 * Mark all notifications as read
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await fetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to mark all as read')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all })
    },
  })
}

/**
 * Delete a notification
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string): Promise<void> => {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to delete notification')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all })
    },
  })
}

/**
 * Delete all read notifications
 */
export function useClearReadNotifications() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to clear notifications')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all })
    },
  })
}
