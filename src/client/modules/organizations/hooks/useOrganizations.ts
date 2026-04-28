/**
 * Organisation hooks — TanStack Query wrappers around the better-auth
 * organisation plugin endpoints + our custom convenience routes.
 *
 * Two surfaces the hooks talk to:
 *   - /api/organizations/* — our custom helpers (listUserOrgs +
 *     getActiveOrg). Returns the user's role per org, which the
 *     plugin's /list endpoint doesn't include.
 *   - /api/auth/organization/* — better-auth plugin endpoints for
 *     mutations (create/invite/accept/remove/update-role/leave) and
 *     reading members.
 *
 * Cache namespace: ['orgs']. Mutations invalidate broadly so the
 * switcher and any open detail page both refresh.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

// ─── Types ──────────────────────────────────────────────────────────

export type OrgRole = 'owner' | 'admin' | 'member'

export interface MyOrg {
  id: string
  name: string
  slug: string
  role: OrgRole
}

export interface ActiveOrg {
  organizationId: string
  organizationName: string
  organizationSlug: string
  role: OrgRole
}

export interface MembershipResponse {
  organizations: MyOrg[]
  active: ActiveOrg | null
}

export interface OrgMember {
  id: string
  organizationId: string
  userId: string
  role: OrgRole
  /** Unix integer when the row was inserted by raw SQL (backfill
   *  migration) or ISO 8601 string when inserted via the better-auth
   *  adapter. Components must handle both — see parseDate() in
   *  MembersList. */
  createdAt: number | string
  user: {
    id: string
    name: string | null
    email: string
    image: string | null
  }
}

export interface OrgInvitation {
  id: string
  email: string
  organizationId: string
  inviterId: string
  role: OrgRole
  status: 'pending' | 'accepted' | 'cancelled' | 'rejected'
  expiresAt: string
  createdAt: string
}

// ─── Cache keys ─────────────────────────────────────────────────────

export const ORG_KEYS = {
  all: ['orgs'] as const,
  membership: () => [...ORG_KEYS.all, 'membership'] as const,
  members: (orgId: string) => [...ORG_KEYS.all, 'members', orgId] as const,
  invitations: (orgId: string) => [...ORG_KEYS.all, 'invitations', orgId] as const,
}

// ─── Reads ──────────────────────────────────────────────────────────

/**
 * Single round-trip for the org switcher: returns my orgs + the
 * active one. Backed by our custom helpers, not the plugin's /list.
 */
export function useMembership() {
  return useQuery({
    queryKey: ORG_KEYS.membership(),
    queryFn: () => apiClient.get<MembershipResponse>('/api/organizations/me/membership'),
    staleTime: 60_000,
  })
}

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? ORG_KEYS.members(orgId) : ['orgs', 'members', 'none'],
    queryFn: () =>
      apiClient.get<{ members: OrgMember[]; total: number }>(
        `/api/auth/organization/list-members?organizationId=${orgId}`,
      ),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

/**
 * Pending invitations for an org. Plugin returns a bare array; we
 * normalise to { invitations, total } so callers don't have to know.
 * Falls back to an empty list when the invitation table is missing
 * (returns 500), so the UI keeps working even on partial schemas.
 */
export function useOrgInvitations(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? ORG_KEYS.invitations(orgId) : ['orgs', 'invitations', 'none'],
    queryFn: async () => {
      try {
        const raw = await apiClient.get<OrgInvitation[] | { invitations: OrgInvitation[] }>(
          `/api/auth/organization/list-invitations?organizationId=${orgId}`,
        )
        const invitations = Array.isArray(raw) ? raw : (raw.invitations ?? [])
        return { invitations, total: invitations.length }
      } catch {
        // invitation table not present yet — empty list keeps the UI happy
        return { invitations: [], total: 0 }
      }
    },
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

/**
 * Cancel a pending invitation. Better-auth doesn't ship a dedicated
 * cancel endpoint — we POST to /reject (which sets status='rejected').
 */
export function useCancelInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiClient.post('/api/auth/organization/cancel-invitation', { invitationId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORG_KEYS.all }),
  })
}

// ─── Mutations ──────────────────────────────────────────────────────

interface CreateOrgInput {
  name: string
  slug?: string
  logo?: string
}

export function useCreateOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOrgInput) =>
      apiClient.post<{ id: string; name: string; slug: string }>(
        '/api/auth/organization/create',
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORG_KEYS.all }),
  })
}

export function useSetActiveOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (organizationId: string) =>
      apiClient.post('/api/auth/organization/set-active', { organizationId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORG_KEYS.all }),
  })
}

interface InviteInput {
  email: string
  role?: OrgRole
  organizationId: string
}

export function useInviteMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: InviteInput) =>
      apiClient.post<OrgInvitation>('/api/auth/organization/invite-member', input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ORG_KEYS.invitations(vars.organizationId) })
      qc.invalidateQueries({ queryKey: ORG_KEYS.members(vars.organizationId) })
    },
  })
}

export function useAcceptInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiClient.post('/api/auth/organization/accept-invitation', { invitationId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORG_KEYS.all }),
  })
}

interface RemoveMemberInput {
  organizationId: string
  memberIdOrEmail: string
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RemoveMemberInput) =>
      apiClient.post('/api/auth/organization/remove-member', input),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ORG_KEYS.members(v.organizationId) }),
  })
}

interface UpdateRoleInput {
  organizationId: string
  memberId: string
  role: OrgRole
}

export function useUpdateMemberRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateRoleInput) =>
      apiClient.post('/api/auth/organization/update-member-role', input),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ORG_KEYS.members(v.organizationId) }),
  })
}

export function useLeaveOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (organizationId: string) =>
      apiClient.post('/api/auth/organization/leave', { organizationId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ORG_KEYS.all }),
  })
}
