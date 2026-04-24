/**
 * TanStack Query hooks for the config-diff proposal primitive.
 *
 * Consumed by the Skills editor (Save + AI Sparkle flows) and the chat
 * propose_patch tool renderer. Backend is /api/config-diff/*.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import type {
  ConfigDiffKind,
  ConfigDiffProposal,
} from '@/shared/config/diff-proposal'

export const configDiffKeys = {
  all: ['config-diff'] as const,
  byId: (id: string) => [...configDiffKeys.all, 'by-id', id] as const,
  forResource: (kind: ConfigDiffKind, id: string) =>
    [...configDiffKeys.all, 'for-resource', kind, id] as const,
}

export interface CreateProposalBody {
  resource: { kind: ConfigDiffKind; id: string; label: string }
  after: string
  summary: string
  reason?: string | null
  format?: 'markdown' | 'json' | 'yaml' | 'plain'
}

export function useCreateProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateProposalBody) =>
      apiClient.post<{ proposal: ConfigDiffProposal }>('/api/config-diff', body),
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: configDiffKeys.forResource(
          data.proposal.resource.kind,
          data.proposal.resource.id,
        ),
      })
    },
  })
}

export function useProposal(id: string | null | undefined) {
  return useQuery({
    queryKey: configDiffKeys.byId(id ?? ''),
    queryFn: () =>
      apiClient.get<{ proposal: ConfigDiffProposal }>(`/api/config-diff/${id}`),
    enabled: !!id,
  })
}

export function useProposalsForResource(
  kind: ConfigDiffKind,
  id: string | null | undefined,
) {
  return useQuery({
    queryKey: configDiffKeys.forResource(kind, id ?? ''),
    queryFn: () =>
      apiClient.get<{ proposals: ConfigDiffProposal[]; count: number }>(
        `/api/config-diff/for-resource?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id ?? '')}`,
      ),
    enabled: !!id,
  })
}

export function useApproveProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ proposal: ConfigDiffProposal }>(
        `/api/config-diff/${id}/apply`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: configDiffKeys.all })
      // Also invalidate skills so the rewritten body shows up.
      qc.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}

export function useRejectProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ proposal: ConfigDiffProposal }>(
        `/api/config-diff/${id}/reject`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: configDiffKeys.all })
    },
  })
}

export interface AiEditSkillBody {
  instruction: string
}

export function useAiEditSkill(name: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AiEditSkillBody) =>
      apiClient.post<{ proposal: ConfigDiffProposal }>(
        `/api/skills/${name}/ai-edit`,
        body,
      ),
    onSuccess: () => {
      if (name) {
        qc.invalidateQueries({
          queryKey: configDiffKeys.forResource('skill', name),
        })
      }
    },
  })
}
