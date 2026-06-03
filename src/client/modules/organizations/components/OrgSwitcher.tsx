/**
 * OrgSwitcher — sidebar header replacement showing the user's active
 * organisation + a dropdown to flip between orgs / create / manage.
 *
 * Renders inline in `AppSidebar` instead of the static product brand
 * block. The product brand still appears on public pages (landing,
 * sign-in) and in the tab title — once authed, the sidebar shows the
 * user's tenant context (Slack / Linear / Notion convention).
 *
 * Behaviour notes:
 *   - Switching active org always hard-reloads the dashboard. SPA
 *     nav after a better-auth session-state change is unreliable
 *     on Workers; full reload is the safe path.
 *   - When the user has no orgs (transient state during signup or
 *     after a backfill failure) we render a "Create your first
 *     workspace" CTA instead of an empty switcher.
 *   - The active-org name is the sidebar title; falls back to the
 *     starter's `appConfig.name` only if no org could be loaded.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Check, ChevronsUpDown, Plus, Settings, UserPlus } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { CreateOrganizationDialog } from './CreateOrganizationDialog'
import { useMembership, useSetActiveOrg, type MyOrg } from '../hooks/useOrganizations'
import { appConfig } from '@/shared/config/app'
import { cn } from '@/lib/utils'

export function OrgSwitcher() {
  const { data, isLoading } = useMembership()
  const setActive = useSetActiveOrg()
  const [createOpen, setCreateOpen] = useState(false)
  const navigate = useNavigate()

  const active = data?.active
  const orgs = data?.organizations ?? []

  const handleSwitch = async (org: MyOrg) => {
    if (active?.organizationId === org.id) return
    try {
      await setActive.mutateAsync(org.id)
    } finally {
      // Hard reload — see better-auth-cloudflare rule + the
      // CreateOrganizationDialog comment.
      window.location.href = '/dashboard'
    }
  }

  // Empty state — no org for this user. Lets them recover without
  // having to know about /api/organizations.
  if (!isLoading && orgs.length === 0) {
    return (
      <>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => setCreateOpen(true)}
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Plus className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">Create workspace</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  Sign in to get started
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
      </>
    )
  }

  // The visible label uses the active org name; falls back to the
  // first org if `active` is somehow null but we have orgs (rare —
  // session-create hook should have set active).
  const display = active
    ? { name: active.organizationName, role: active.role, id: active.organizationId }
    : orgs[0]
      ? { name: orgs[0].name, role: orgs[0].role, id: orgs[0].id }
      : null

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[slot=sidebar-menu-button]:!p-1.5"
                aria-label="Switch organisation"
              >
                <Avatar name={display?.name} />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">
                    {isLoading ? (
                      <span className="text-muted-foreground">Loading…</span>
                    ) : (
                      (display?.name ?? appConfig.name)
                    )}
                  </span>
                  {display?.role && (
                    <span className="truncate text-[11px] text-muted-foreground capitalize">
                      {display.role}
                    </span>
                  )}
                </div>
                <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              align="start"
              side="bottom"
            >
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Workspaces
              </DropdownMenuLabel>
              {orgs.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleSwitch(org)}
                  className="gap-2 cursor-pointer"
                  disabled={setActive.isPending}
                >
                  <Avatar name={org.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{org.name}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">{org.role}</div>
                  </div>
                  {active?.organizationId === org.id && <Check className="size-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setCreateOpen(true)}
                className="gap-2 cursor-pointer"
              >
                <Plus className="size-4" />
                Create organisation
              </DropdownMenuItem>
              {active && (
                <>
                  <DropdownMenuItem
                    onClick={() => navigate('/dashboard/organization')}
                    className="gap-2 cursor-pointer"
                  >
                    <Settings className="size-4" />
                    Manage current
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate('/dashboard/organization?tab=members')}
                    className="gap-2 cursor-pointer"
                  >
                    <UserPlus className="size-4" />
                    Invite people
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      {setActive.isPending && (
        <div className="px-3 py-1 text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Spinner size="xs" />
          Switching…
        </div>
      )}
      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}

/**
 * First-letter avatar with a stable colour derived from the name.
 * Keeps the sidebar visually grounded when an org has no logo set —
 * matches the Linear / Notion convention.
 */
function Avatar({ name, size = 'md' }: { name?: string; size?: 'sm' | 'md' }) {
  const letter = (name?.trim()?.[0] ?? '?').toUpperCase()
  // Cheap deterministic colour from the first char's code point.
  const colours = [
    'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    'bg-blue-500/20 text-blue-700 dark:text-blue-300',
    'bg-amber-500/20 text-amber-700 dark:text-amber-300',
    'bg-purple-500/20 text-purple-700 dark:text-purple-300',
    'bg-pink-500/20 text-pink-700 dark:text-pink-300',
    'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300',
  ]
  const palette = colours[letter.charCodeAt(0) % colours.length]
  const sizing = size === 'sm' ? 'size-6 text-xs' : 'aspect-square size-8 text-sm'
  return (
    <div
      className={cn('flex items-center justify-center rounded-lg font-semibold', sizing, palette)}
    >
      {/^[A-Z]/.test(letter) ? (
        letter
      ) : (
        <Building2 className={size === 'sm' ? 'size-3.5' : 'size-4'} />
      )}
    </div>
  )
}
