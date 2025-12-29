import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/client/lib/auth'

/**
 * Hook to check if the current user has admin privileges
 *
 * Uses dedicated /api/admin/status endpoint that returns {isAdmin: boolean}
 * instead of 403, avoiding console errors.
 */
export function useAdminStatus() {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['admin-status'],
    queryFn: async (): Promise<boolean> => {
      const response = await fetch('/api/admin/status', {
        credentials: 'include',
      })

      if (!response.ok) return false

      const data = (await response.json()) as { isAdmin?: boolean }
      return data.isAdmin === true
    },
    enabled: !!session, // Only check when logged in
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
  })
}
