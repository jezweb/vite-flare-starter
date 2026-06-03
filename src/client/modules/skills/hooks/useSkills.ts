/**
 * TanStack Query hooks for skills — catalog, install, upload, toggle, delete.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import { queryKeys } from '@/client/lib/query-keys'

export interface SkillSummary {
  name: string
  description: string
  source: 'bundled' | 'r2' | 'github'
  userId: string
  /** True when this row is the caller's personal override (not the bundled default). */
  isPersonal: boolean
  disableModelInvocation?: boolean
}

export interface SkillDetail {
  name: string
  description: string
  source: 'bundled' | 'r2' | 'github'
  userId: string
  isPersonal: boolean
  directory: string
  resources: string[]
  frontmatter: Record<string, unknown>
  body: string
  warnings: string[]
}

/** List skill metadata only — small payload, used by slash menu + dashboard list. */
export function useSkillSummary() {
  return useQuery({
    queryKey: queryKeys.skills.summary(),
    queryFn: () => apiClient.get<{ skills: SkillSummary[]; count: number }>('/api/skills/summary'),
    staleTime: 30_000,
  })
}

/** Load a single skill by name — used for preview dialogs. */
export function useSkill(name: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skills.detail(name ?? ''),
    queryFn: () => apiClient.get<SkillDetail>(`/api/skills/${name}`),
    enabled: !!name,
    staleTime: 30_000,
  })
}

/** Full list including enabled/disabled rows from D1 (admin-style view). */
export function useSkillsList() {
  return useQuery({
    queryKey: queryKeys.skills.list(),
    queryFn: () =>
      apiClient.get<{
        skills: Array<{
          id: string
          userId: string
          name: string
          description: string
          source: string
          enabled: boolean
          isPersonal: boolean
          createdAt: string
          updatedAt: string
        }>
        count: number
      }>('/api/skills'),
  })
}

export function useInstallGitHubSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (url: string) =>
      apiClient.post<{
        success: boolean
        name: string
        description: string
        mode: 'single' | 'directory'
        files?: string[]
      }>('/api/skills/github', { url }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.skills.all })
    },
  })
}

export function useUploadSkillZip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      // apiClient.post sets Content-Type json by default — use fetch directly for multipart.
      const resp = await fetch('/api/skills/upload-zip', {
        method: 'POST',
        body: form,
        credentials: 'include',
      })
      if (!resp.ok) {
        const err = (await resp.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? `Upload failed: ${resp.status}`)
      }
      return resp.json() as Promise<{
        success: boolean
        name: string
        description: string
        files: string[]
      }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.skills.all })
    },
  })
}

export function useUploadSkillContent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { content: string; overwrite?: boolean }) =>
      apiClient.post<{ success: boolean; name: string; description: string; path: string }>(
        '/api/skills/upload',
        payload
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills.all }),
  })
}

export function useToggleSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      apiClient.patch<{ success: boolean; name: string; enabled: boolean }>(`/api/skills/${name}`, {
        enabled,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills.all }),
  })
}

export function useDeleteSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      apiClient.delete<{ success: boolean; name: string; deleted: boolean }>(`/api/skills/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills.all }),
  })
}

export function useSyncBundled() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ success: boolean; added: number; updated: number; removed: number }>(
        '/api/skills/sync',
        {}
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills.all }),
  })
}
