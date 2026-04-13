/**
 * Dashboard Layout
 *
 * Config-driven layout with collapsible sidebar, sections, and feature/role filtering.
 * Edit src/shared/config/nav.ts to customise navigation — don't modify this file.
 *
 * @see src/shared/config/nav.ts — sidebar sections and items
 * @see src/shared/config/features.ts — feature flag definitions
 */
import { useState, useMemo } from 'react'
import { Outlet, Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useTheme } from '@/client/components/theme-provider'
import { useSession, authClient } from '@/client/lib/auth'
import { usePreferences, useUpdatePreferences } from '@/client/modules/settings/hooks/useSettings'
import { useAdminStatus } from '@/client/modules/admin/hooks/useAdminStatus'
import {
  Menu,
  Moon,
  Sun,
  User,
  Settings,
  LogOut,
  Shield,
  PanelLeftClose,
  PanelLeft,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { NotificationBell } from '@/client/components/NotificationBell'
import { EmailVerificationBanner } from '@/client/components/EmailVerificationBanner'
import { cn } from '@/lib/utils'
import { features } from '@/shared/config/features'
import { appConfig } from '@/shared/config/app'
import { APP_VERSION } from '@/shared/config/constants'
import { NAV_SECTIONS, type NavItem, type NavSection } from '@/shared/config/nav'

const COLLAPSED_KEY = 'sidebar-collapsed'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Filter nav items by feature flags and user role */
function filterItems(
  items: NavItem[],
  featureFlags: Record<string, boolean>,
  userRole?: string
): NavItem[] {
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

// ─── Sidebar Section ─────────────────────────────────────────────────────────

function SidebarSection({
  section,
  collapsed,
  onNavigate,
}: {
  section: NavSection
  collapsed: boolean
  onNavigate?: () => void
}) {
  const location = useLocation()
  const hasActiveItem = section.items.some(
    (item) => location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  )
  const [open, setOpen] = useState(hasActiveItem || !section.defaultCollapsed)

  // Collapsed mode — icons only
  if (collapsed) {
    return (
      <div className="mb-2">
        {section.items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            title={item.label}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center rounded-md p-2 mb-0.5 transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary border-l-2 border-l-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )
            }
          >
            {item.icon && <item.icon className="h-4 w-4" />}
          </NavLink>
        ))}
      </div>
    )
  }

  // Expanded mode — full labels with collapsible section headers
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {section.label}
      </button>
      {open && (
        <div className="mt-0.5">
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium border-l-2 border-l-primary pl-2.5'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              {item.icon && <item.icon className="h-4 w-4" />}
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Desktop Sidebar ─────────────────────────────────────────────────────────

function Sidebar() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === 'true'
  )
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? 'user'

  const visibleSections = useMemo(() => {
    const featureFlags = features as unknown as Record<string, boolean>
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: filterItems(section.items, featureFlags, userRole),
    })).filter((section) => section.items.length > 0)
  }, [userRole])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(COLLAPSED_KEY, String(next))
  }

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border bg-card transition-all duration-200 shrink-0',
        collapsed ? 'w-14' : 'w-60'
      )}
    >
      {/* Logo + collapse toggle */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-3">
        <Link to="/" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
          {appConfig.name.charAt(0)}
        </Link>
        {!collapsed && (
          <>
            <Link to="/" className="min-w-0 flex-1">
              <span className="text-sm font-semibold truncate block">{appConfig.name}</span>
            </Link>
            <button
              onClick={toggle}
              className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </>
        )}
        {collapsed && (
          <button
            onClick={toggle}
            className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Expand sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation sections */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {visibleSections.map((section) => (
          <SidebarSection key={section.label} section={section} collapsed={collapsed} />
        ))}
      </nav>

      {/* Version */}
      {!collapsed && (
        <div className="px-3 py-1 border-t border-border">
          <p className="text-[9px] text-muted-foreground/40">v{APP_VERSION}</p>
        </div>
      )}
    </aside>
  )
}

// ─── Mobile Sidebar ──────────────────────────────────────────────────────────

function MobileSidebar() {
  const [open, setOpen] = useState(false)
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? 'user'

  const visibleSections = useMemo(() => {
    const featureFlags = features as unknown as Record<string, boolean>
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: filterItems(section.items, featureFlags, userRole),
    })).filter((section) => section.items.length > 0)
  }, [userRole])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-60 p-0">
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center gap-2 border-b border-border px-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
              {appConfig.name.charAt(0)}
            </div>
            <span className="text-sm font-semibold">{appConfig.name}</span>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 py-3">
            {visibleSections.map((section) => (
              <SidebarSection
                key={section.label}
                section={section}
                collapsed={false}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header() {
  const { theme, setTheme } = useTheme()
  const { data: session } = useSession()
  const { data: preferences } = usePreferences()
  const { data: isAdmin } = useAdminStatus()
  const updatePreferences = useUpdatePreferences()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await authClient.signOut()
    navigate('/sign-in')
  }

  const toggleTheme = () => {
    if (session && preferences) {
      const newMode = preferences.mode === 'dark' ? 'light' : 'dark'
      updatePreferences.mutate({ theme: preferences.theme, mode: newMode })
    } else {
      setTheme(theme === 'dark' ? 'light' : 'dark')
    }
  }

  const userInitials = session?.user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U'

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background px-4 md:px-6">
      <MobileSidebar />
      <div className="flex-1" />

      {features.notifications && <NotificationBell />}

      <Button variant="ghost" size="icon" onClick={toggleTheme}>
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        <span className="sr-only">Toggle theme</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-10 w-10 rounded-full">
            <Avatar className="h-10 w-10">
              <AvatarImage src={session?.user?.image || undefined} alt={session?.user?.name || 'User'} />
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{session?.user?.name}</p>
              <p className="text-xs leading-none text-muted-foreground">{session?.user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/dashboard/profile')}>
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/dashboard/settings?tab=security')}>
            <Shield className="mr-2 h-4 w-4" />
            Security
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/dashboard/settings?tab=settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/dashboard/admin')}>
                <Shield className="mr-2 h-4 w-4" />
                Admin
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
    </header>
  )
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export function DashboardLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <EmailVerificationBanner />
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
