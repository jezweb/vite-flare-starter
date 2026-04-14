/**
 * Dashboard Layout — built on shadcn Sidebar primitives with inset variant
 *
 * Features: collapse-to-icons, keyboard shortcut (Cmd+B), mobile sheet,
 * state persistence, smooth transitions. Config-driven via nav.ts.
 *
 * @see src/shared/config/nav.ts — sidebar sections and items
 * @see src/shared/config/features.ts — feature flag definitions
 */
import { useMemo } from 'react'
import { Outlet, Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { useTheme } from '@/client/components/theme-provider'
import { useSession, authClient } from '@/client/lib/auth'
import { usePreferences, useUpdatePreferences } from '@/client/modules/settings/hooks/useSettings'
import { useAdminStatus } from '@/client/modules/admin/hooks/useAdminStatus'
import {
  Moon,
  Sun,
  UserCircle,
  Settings,
  LogOut,
  Shield,
  MoreVertical,
  Bell,
  KeyRound,
} from 'lucide-react'
import { NotificationBell } from '@/client/components/NotificationBell'
import { CommandPalette } from '@/client/components/CommandPalette'
import { KeyboardShortcuts } from '@/client/components/KeyboardShortcuts'
import { EmailVerificationBanner } from '@/client/components/EmailVerificationBanner'
import { features } from '@/shared/config/features'
import { appConfig } from '@/shared/config/app'
import { NAV_SECTIONS, type NavItem } from '@/shared/config/nav'

function filterItems(items: NavItem[], featureFlags: Record<string, boolean>, userRole?: string): NavItem[] {
  return items.filter((item) => {
    if (item.feature && !featureFlags[item.feature]) return false
    if (item.minRole) {
      const roleHierarchy: Record<string, number> = { user: 0, manager: 1, admin: 2 }
      const required = roleHierarchy[item.minRole] ?? 0
      const current = roleHierarchy[userRole ?? 'user'] ?? 0
      if (current < required) return false
    }
    return true
  })
}

function AppSidebar() {
  const { data: session } = useSession()
  const location = useLocation()
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? 'user'

  const visibleSections = useMemo(() => {
    const featureFlags = features as unknown as Record<string, boolean>
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: filterItems(section.items, featureFlags, userRole),
    })).filter((section) => section.items.length > 0)
  }, [userRole])

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <span className="text-xs font-bold">{appConfig.name.charAt(0)}</span>
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-base font-semibold">{appConfig.name}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {visibleSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const isActive =
                    location.pathname === item.to ||
                    (item.to !== '/dashboard' && location.pathname.startsWith(item.to + '/'))
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <NavLink to={item.to} end={item.to === '/dashboard'}>
                          {item.icon && <item.icon />}
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function NavUser() {
  const { data: session } = useSession()
  const { data: isAdmin } = useAdminStatus()
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
              <DropdownMenuItem onClick={() => navigate('/dashboard/profile')}>
                <UserCircle className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/dashboard/settings?tab=security')}>
                <KeyRound className="mr-2 h-4 w-4" />
                Security
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/dashboard/settings?tab=settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/dashboard/settings?tab=notifications')}>
                <Bell className="mr-2 h-4 w-4" />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/dashboard/admin')}>
                  <Shield className="mr-2 h-4 w-4" />
                  Admin Panel
                </DropdownMenuItem>
              </>
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

function Header() {
  const { theme, setTheme } = useTheme()
  const { data: session } = useSession()
  const { data: preferences } = usePreferences()
  const updatePreferences = useUpdatePreferences()

  const toggleTheme = () => {
    if (session && preferences) {
      const newMode = preferences.mode === 'dark' ? 'light' : 'dark'
      updatePreferences.mutate({ theme: preferences.theme, mode: newMode })
    } else {
      setTheme(theme === 'dark' ? 'light' : 'dark')
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 transition-[width,height] ease-linear">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
      <div className="flex-1" />

      {features.notifications && <NotificationBell />}

      <Button variant="ghost" size="icon" onClick={toggleTheme}>
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        <span className="sr-only">Toggle theme</span>
      </Button>
    </header>
  )
}

export function DashboardLayout() {
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <CommandPalette />
      <KeyboardShortcuts />
      <SidebarInset>
        <Header />
        <EmailVerificationBanner />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
