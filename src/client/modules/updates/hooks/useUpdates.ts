/**
 * useUpdates — TanStack Query hooks for the What's New feed.
 *
 * The summary query is fetched by the sidebar and the command palette, so
 * it runs on every page in the app. Hence the long staleTime: release
 * notes do not need to be fresh to the second, and re-fetching a badge
 * count on every navigation is a round trip for nothing.
 *
 * (It is NOT rate limited. `rateLimiter` runs on `/api/*` but only acts
 * on endpoints listed in its own config, and this one is not listed —
 * see `server/middleware/rate-limit.ts`. The staleTime is about wasted
 * requests, not about a budget.)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import type { ChangelogCategory } from '@/server/modules/updates/db/schema'

export interface UpdateEntry {
  id: string
  releaseKey: string | null
  title: string
  body: string
  category: ChangelogCategory
  version: string | null
  highlight: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UpdatesSummary {
  total: number
  unseenCount: number
  latestPublishedAt: string | null
  highlight: { id: string; title: string; publishedAt: string | null } | null
}

export interface UpdateEntryInput {
  title: string
  body: string
  category?: ChangelogCategory
  version?: string
  highlight?: boolean
  releaseKey?: string
  publish?: boolean
}

export const UPDATE_KEYS = {
  all: ['updates'] as const,
  entries: () => [...UPDATE_KEYS.all, 'entries'] as const,
  summary: () => [...UPDATE_KEYS.all, 'summary'] as const,
}

/** Five minutes — see the file header. */
const SUMMARY_STALE_TIME = 5 * 60 * 1000

export function useUpdateEntries() {
  return useQuery({
    queryKey: UPDATE_KEYS.entries(),
    queryFn: () => apiClient.get<{ entries: UpdateEntry[]; count: number }>('/api/updates/entries'),
  })
}

/** Publish a draft, or pull a published entry back to draft. Admin only. */
export function useSetUpdatePublished() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      apiClient.patch(`/api/updates/entries/${id}`, { publish }),
    onSuccess: () => qc.invalidateQueries({ queryKey: UPDATE_KEYS.all }),
  })
}

export function useUpdatesSummary() {
  return useQuery({
    queryKey: UPDATE_KEYS.summary(),
    queryFn: () => apiClient.get<UpdatesSummary>('/api/updates/summary'),
    staleTime: SUMMARY_STALE_TIME,
    // A failed badge query must never surface as an error to the user —
    // the feature simply stays invisible.
    retry: false,
  })
}

export function useCreateUpdateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateEntryInput) =>
      apiClient.post<{ id: string; created: boolean }>('/api/updates/entries', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: UPDATE_KEYS.all }),
  })
}

export function useDeleteUpdateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/updates/entries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: UPDATE_KEYS.all }),
  })
}

/**
 * Mark the feed seen up to a specific entry.
 *
 * Callers pass the publishedAt of the newest entry they actually
 * RENDERED. Passing "now" instead would swallow an entry published while
 * the page was open — it would be marked seen without ever being shown.
 */
export function useMarkUpdatesSeen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (seenAt: string) => apiClient.put('/api/updates/seen', { seenAt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: UPDATE_KEYS.summary() }),
  })
}
