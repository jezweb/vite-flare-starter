/**
 * Spaces — TanStack Query hooks. Mirrors the REST contract in
 * src/server/modules/spaces/routes.ts.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export interface SpaceSummary {
  id: string
  title: string | null
  spaceMode: 'open' | 'invite' | 'org' | null
  defaultReplyMode: 'always' | 'mention' | 'proactive' | 'ambient' | 'off' | null
  historyEnabled: number
  starred: number
  createdAt: string
  updatedAt: string
  pinnedToSidebar: number
  notificationLevel: 'all' | 'mentions' | 'muted'
  lastReadAt: number | null
  memberCount: number
  agentCount: number
}

export interface SpaceMember {
  id: string
  kind: 'user' | 'agent'
  userId: string | null
  agentClass: string | null
  agentName: string | null
  replyMode: 'always' | 'mention' | 'proactive' | 'ambient' | 'off' | null
  role: 'owner' | 'admin' | 'member'
  notificationLevel: 'all' | 'mentions' | 'muted'
  pinnedToSidebar: number
  lastReadAt: number | null
  joinedAt: number
}

export interface SpaceUserInfo {
  id: string
  name: string
  email: string
  image: string | null
}

export interface SpaceMessage {
  id: string
  conversationId: string
  role: string
  parts: unknown[]
  metadata?: {
    senderKind?: 'user' | 'agent'
    senderUserId?: string
    senderAgentName?: string
    senderAgentClass?: string
  }
  parentMessageId: string | null
  threadCount: number
  lastThreadAt: number | null
  reactions?: Record<string, string[]>
  pinnedAt: number | null
  pinnedByUserId: string | null
  createdAt: string
}

export interface SpaceDetail {
  space: {
    id: string
    title: string | null
    summary: string | null
    spaceMode: string | null
    defaultReplyMode: string | null
    historyEnabled: number
    starred: number
    createdAt: string
    updatedAt: string
  }
  members: SpaceMember[]
  users: SpaceUserInfo[]
  messages: SpaceMessage[]
}

export function useSpacesList() {
  return useQuery({
    queryKey: ['spaces'],
    queryFn: () => apiClient.get<{ spaces: SpaceSummary[] }>('/api/spaces'),
  })
}

export function useSpace(id: string | undefined) {
  return useQuery({
    queryKey: ['spaces', id],
    queryFn: () => apiClient.get<SpaceDetail>(`/api/spaces/${id}`),
    enabled: !!id,
  })
}

export function useSpaceMessages(
  id: string | undefined,
  opts: { threadParentId?: string | null } = {}
) {
  const params = new URLSearchParams()
  params.set('limit', '50')
  if (opts.threadParentId) params.set('threadParentId', opts.threadParentId)
  return useQuery({
    queryKey: ['spaces', id, 'messages', opts.threadParentId ?? 'top'],
    queryFn: () =>
      apiClient.get<{ messages: SpaceMessage[] }>(
        `/api/spaces/${id}/messages?${params.toString()}`
      ),
    enabled: !!id,
  })
}

interface CreateSpaceInput {
  title: string
  description?: string
  spaceMode?: 'open' | 'invite' | 'org'
  defaultReplyMode?: 'always' | 'mention' | 'proactive' | 'ambient' | 'off'
  inviteUserIds?: string[]
  agents?: Array<{
    agentClass: string
    agentName: string
    replyMode?: 'always' | 'mention' | 'proactive' | 'ambient' | 'off'
  }>
}
export function useCreateSpace() {
  const qc = useQueryClient()
  return useMutation<{ id: string; title: string }, Error, CreateSpaceInput>({
    mutationFn: (input) => apiClient.post<{ id: string; title: string }>('/api/spaces', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces'] })
    },
  })
}

export function useSendSpaceMessage(spaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation<
    { id: string; dispatched: number },
    Error,
    {
      parts: unknown[]
      parentMessageId?: string | null
      metadata?: Record<string, unknown>
      /** Phase 2: quoted source message for inline quote-in-reply chip. */
      quotedMessageId?: string | null
    }
  >({
    mutationFn: (body) =>
      apiClient.post<{ id: string; dispatched: number }>(`/api/spaces/${spaceId}/messages`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces', spaceId, 'messages'] })
      qc.invalidateQueries({ queryKey: ['spaces'] })
    },
  })
}

export function useUpdateSpaceMembership(spaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation<
    { ok: boolean },
    Error,
    { pinnedToSidebar?: boolean; notificationLevel?: 'all' | 'mentions' | 'muted' }
  >({
    mutationFn: (body) =>
      apiClient.patch<{ ok: boolean }>(`/api/spaces/${spaceId}/membership`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces'] })
      qc.invalidateQueries({ queryKey: ['spaces', spaceId] })
    },
  })
}

export function useMarkSpaceRead(spaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation<{ ok: boolean }, Error, void>({
    mutationFn: () => apiClient.patch<{ ok: boolean }>(`/api/spaces/${spaceId}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces'] })
    },
  })
}

export function useDeleteSpace() {
  const qc = useQueryClient()
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (id) => apiClient.delete<{ ok: boolean }>(`/api/spaces/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces'] })
    },
  })
}

export function useLeaveSpace() {
  const qc = useQueryClient()
  return useMutation<{ ok: boolean }, Error, { spaceId: string; memberId: string }>({
    mutationFn: ({ spaceId, memberId }) =>
      apiClient.delete<{ ok: boolean }>(`/api/spaces/${spaceId}/members/${memberId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces'] })
    },
  })
}

export function useUpdateSpaceSettings(spaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation<
    { ok: boolean },
    Error,
    {
      title?: string
      summary?: string
      spaceMode?: 'open' | 'invite' | 'org'
      defaultReplyMode?: 'always' | 'mention' | 'proactive' | 'ambient' | 'off'
      historyEnabled?: boolean
    }
  >({
    mutationFn: (body) => apiClient.patch<{ ok: boolean }>(`/api/spaces/${spaceId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces', spaceId] })
      qc.invalidateQueries({ queryKey: ['spaces'] })
    },
  })
}

export function useInviteAgent(spaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation<
    { ok: boolean },
    Error,
    {
      agentClass: string
      agentName: string
      replyMode?: 'always' | 'mention' | 'proactive' | 'ambient' | 'off'
    }
  >({
    mutationFn: (body) =>
      apiClient.post<{ ok: boolean }>(`/api/spaces/${spaceId}/members`, { kind: 'agent', ...body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces', spaceId] })
    },
  })
}

// ─── Phase 2/3 hooks ─────────────────────────────────────────────

export function usePinMessage() {
  const qc = useQueryClient()
  return useMutation<{ ok: boolean }, Error, { messageId: string; pinned: boolean }>({
    mutationFn: ({ messageId, pinned }) =>
      apiClient.patch<{ ok: boolean }>(`/api/messages/${messageId}/pin`, { pinned }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces'] })
    },
  })
}

export function useStarMessage() {
  return useMutation<
    { ok: boolean; starredByUserIds: string[] },
    Error,
    { messageId: string; starred: boolean }
  >({
    mutationFn: ({ messageId, starred }) =>
      apiClient.patch<{ ok: boolean; starredByUserIds: string[] }>(
        `/api/messages/${messageId}/star`,
        { starred }
      ),
  })
}

export function useForwardMessage() {
  return useMutation<
    { id: string },
    Error,
    { messageId: string; targetSpaceId: string; note?: string }
  >({
    mutationFn: ({ messageId, targetSpaceId, note }) =>
      apiClient.post<{ id: string }>(`/api/messages/${messageId}/forward`, { targetSpaceId, note }),
  })
}

export function useThreadSubscription() {
  return useMutation<{ ok: boolean }, Error, { threadId: string; level: 'all' | 'mute' }>({
    mutationFn: ({ threadId, level }) =>
      apiClient.patch<{ ok: boolean }>(`/api/messages/${threadId}/thread/subscription`, { level }),
  })
}

export function useToggleSpaceHistory(spaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation<{ ok: boolean }, Error, boolean>({
    mutationFn: (enabled) =>
      apiClient.patch<{ ok: boolean }>(`/api/spaces/${spaceId}/history`, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces', spaceId] })
    },
  })
}

export function usePinnedMessages(spaceId: string | undefined) {
  return useQuery({
    queryKey: ['spaces', spaceId, 'pinned'],
    queryFn: () =>
      apiClient.get<{
        pinned: Array<{
          id: string
          parts: unknown
          createdAt: string
          pinnedAt: number
          pinnedByUserId: string
        }>
      }>(`/api/spaces/${spaceId}/messages/pinned`),
    enabled: !!spaceId,
  })
}

export function useGlobalSearch(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ['global-search', query],
    queryFn: () =>
      apiClient.get<{
        results: Array<
          SpaceMessage & { conversationTitle: string | null; conversationKind: string }
        >
      }>(`/api/search/messages?q=${encodeURIComponent(query)}`),
    enabled: enabled && query.length >= 2,
  })
}

export function useBlockMember(spaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation<{ ok: boolean }, Error, { memberId: string; blocked: boolean }>({
    mutationFn: ({ memberId, blocked }) =>
      apiClient.patch<{ ok: boolean }>(`/api/spaces/${spaceId}/members/${memberId}/block`, {
        blocked,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spaces', spaceId] })
    },
  })
}

export function useAvailableAgents(spaceId: string | undefined) {
  return useQuery({
    queryKey: ['spaces', spaceId, 'agents'],
    queryFn: () =>
      apiClient.get<{ agents: { agentClass: string; agentName: string; description: string }[] }>(
        `/api/spaces/${spaceId}/agents`
      ),
    enabled: !!spaceId,
  })
}
