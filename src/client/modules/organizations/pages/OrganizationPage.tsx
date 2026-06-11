/**
 * OrganizationPage — manage the active org.
 *
 * Two tabs:
 *   - Members (default) — list + invite + role + remove
 *   - Settings — name + (future: logo, slug display, danger zone)
 *
 * No active org → empty-state CTA pointing to the org switcher in
 * the sidebar.
 *
 * URL: /dashboard/organization?tab=members | settings
 */
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { UserPlus, LogOut } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/client/components/EmptyState'
import { Building2 } from 'lucide-react'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageFilters, PageFilterTabs } from '@/components/ui/page-filters'
import { HelpDisclosure } from '@/components/ui/help-disclosure'
import { KeyValueRow, KeyValueList } from '@/components/ui/key-value-row'
import { MembersList } from '../components/MembersList'
import { InvitationsList } from '../components/InvitationsList'
import { InviteMemberDialog } from '../components/InviteMemberDialog'
import { useMembership, useLeaveOrg, useOrgMembers } from '../hooks/useOrganizations'

type Tab = 'members' | 'settings'

export function OrganizationPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'settings' ? 'settings' : 'members'
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(searchParams)
    if (t === 'members') p.delete('tab')
    else p.set('tab', t)
    setSearchParams(p, { replace: true })
  }

  const { data, isLoading } = useMembership()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const leave = useLeaveOrg()
  const active = data?.active

  // Members count for the leave-as-sole-owner guard
  const { data: membersData } = useOrgMembers(active?.organizationId)
  const ownerCount = membersData?.members.filter((m) => m.role === 'owner').length ?? 0

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner size="lg" className="text-muted-foreground" />
      </div>
    )
  }

  if (!active) {
    return (
      <div className="container mx-auto max-w-3xl p-4 sm:p-6">
        <EmptyState
          icon={Building2}
          title="No active organisation"
          description="Use the workspace switcher in the sidebar to create or pick one."
        />
      </div>
    )
  }

  const isOwner = active.role === 'owner'
  const isSoleOwner = isOwner && ownerCount === 1

  const handleLeave = async () => {
    try {
      await leave.mutateAsync(active.organizationId)
      toast.success('Left organisation')
      window.location.href = '/dashboard'
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Leave failed')
    }
  }

  return (
    <PageContainer type="form">
      <div data-tour="org-members">
        <PageHeader
          title={tab === 'members' ? 'Members' : 'Organisation settings'}
          subtitle={
            tab === 'members'
              ? `Invite teammates and manage their roles in ${active.organizationName}.`
              : `Identity, branding, and policies for ${active.organizationName}.`
          }
          docTitle="Organisation"
          help={
            <HelpDisclosure>
              <KeyValueList>
                <KeyValueRow label="Org name" value={active.organizationName} />
                <KeyValueRow label="Slug" value={active.organizationSlug} mono />
                <KeyValueRow
                  label="Your role"
                  value={<span className="capitalize">{active.role}</span>}
                />
              </KeyValueList>
            </HelpDisclosure>
          }
          trailing={
            tab === 'members' ? (
              <Button size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}>
                <UserPlus className="size-3.5" />
                Invite member
              </Button>
            ) : undefined
          }
        />
      </div>

      <PageFilters>
        <PageFilterTabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </PageFilterTabs>
      </PageFilters>

      {tab === 'members' && (
        <div className="space-y-4">
          <MembersList organizationId={active.organizationId} myRole={active.role} />
          <InvitationsList organizationId={active.organizationId} />
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Identity</CardTitle>
              <CardDescription>
                Editing org name + logo will land in a follow-up — better-auth's update endpoint
                needs the matching schema columns wired up first. For now, the slug + creation date
                are the stable identifiers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <KV k="Name" v={active.organizationName} />
              <KV k="Slug" v={active.organizationSlug} mono />
              <KV k="Your role" v={active.role} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
              <CardDescription>
                Leaving an organisation removes your access; an owner has to re-invite you to come
                back. Sole owners must transfer ownership before they can leave.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/40"
                onClick={() => setConfirmLeave(true)}
                disabled={isSoleOwner}
                title={isSoleOwner ? 'Transfer ownership first' : undefined}
              >
                <LogOut className="size-3.5" />
                Leave organisation
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={active.organizationId}
      />
      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={`Leave ${active.organizationName}?`}
        description="You'll lose access to this organisation immediately. An owner can re-invite you to return."
        confirmLabel="Leave organisation"
        variant="destructive"
        onConfirm={handleLeave}
      />
    </PageContainer>
  )
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className={mono ? 'font-mono break-all' : 'capitalize'}>{v}</span>
    </div>
  )
}

export default OrganizationPage
