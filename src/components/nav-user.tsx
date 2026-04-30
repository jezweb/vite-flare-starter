/**
 * NavUser — account menu in the sidebar footer.
 *
 * Adapted from shadcn dashboard-01 with our session, auth, and routes.
 */
import { useNavigate } from 'react-router-dom'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { useSession, authClient } from '@/client/lib/auth'
import { useAdminStatus } from '@/client/modules/admin/hooks/useAdminStatus'
import { useBuilderMode } from '@/client/lib/builder-mode'
import { CircleHelp, LogOut, MoreVertical, Settings, Shield, Sparkles, Wrench } from 'lucide-react'

export function NavUser() {
  const { data: session } = useSession()
  const { data: isAdmin } = useAdminStatus()
  const { isBuilder, toggle: toggleBuilder } = useBuilderMode()
  const { isMobile } = useSidebar()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await authClient.signOut()
    navigate('/sign-in')
  }

  const userInitials =
    session?.user?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase() || 'U'

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={session?.user?.image || undefined} alt={session?.user?.name || 'User'} />
                <AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{session?.user?.name}</span>
                <span className="truncate text-xs text-muted-foreground">{session?.user?.email}</span>
              </div>
              <MoreVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={session?.user?.image || undefined} alt={session?.user?.name || 'User'} />
                  <AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{session?.user?.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{session?.user?.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate('/dashboard/settings?tab=profile')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/dashboard/artifacts')}>
                <Sparkles className="mr-2 h-4 w-4" />
                My artifacts
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/dashboard/help')}>
                <CircleHelp className="mr-2 h-4 w-4" />
                Help
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {/*
              * Builder Mode toggle — reveals developer surfaces
              * (Components, Style Guide, Activity, raw skill source) in the
              * sidebar. Per-machine; not synced across devices. Distinct
              * from the admin role which gates shared-state operations.
              */}
            <DropdownMenuCheckboxItem
              checked={isBuilder}
              onCheckedChange={() => toggleBuilder()}
            >
              <Wrench className="mr-2 h-4 w-4" />
              Builder mode
            </DropdownMenuCheckboxItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => navigate('/dashboard/admin')}>
                <Shield className="mr-2 h-4 w-4" />
                Admin Panel
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
