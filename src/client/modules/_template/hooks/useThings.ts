/**
 * useThings — TanStack Query hooks for the Things resource.
 *
 * Pattern: one file per module owns all the read + write hooks. Each
 * hook wraps a call to apiClient + the right TanStack invalidation
 * shape. Page components consume `useThings()` / `useThing(id)` /
 * `useCreateThing()` etc. — never raw `apiClient.get(...)` from the
 * component (so cache invalidation stays consistent).
 *
 * Replace `Thing` with your domain shape and `/api/things` with your
 * endpoint. Backend route should live in `src/server/modules/things/`.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export interface Thing {
  id: string
  name: string
  description: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

interface ListResponse {
  total: number
  things: Thing[]
}

export const THING_KEYS = {
  all: ['things'] as const,
  list: () => [...THING_KEYS.all, 'list'] as const,
  detail: (id: string) => [...THING_KEYS.all, 'detail', id] as const,
}

export function useThings() {
  return useQuery({
    queryKey: THING_KEYS.list(),
    queryFn: () => apiClient.get<ListResponse>('/api/things'),
  })
}

export function useThing(id: string | undefined) {
  return useQuery({
    queryKey: THING_KEYS.detail(id ?? ''),
    queryFn: () => apiClient.get<{ thing: Thing }>(`/api/things/${id}`),
    enabled: Boolean(id),
  })
}

export function useCreateThing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      apiClient.post<{ thing: Thing }>('/api/things', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: THING_KEYS.list() }),
  })
}

export function useDeleteThing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/things/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: THING_KEYS.all }),
  })
}
