import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
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
import { useNavigate } from 'react-router-dom'
import { usePreferences, useUpdatePreferences } from '@/client/modules/settings/hooks/useSettings'
import { useAdminStatus } from '@/client/modules/admin/hooks/useAdminStatus'
import {
  Home,
  Menu,
  Moon,
  Sun,
  User,
  Settings,
  LogOut,
  Shield,
  Palette,
  Component,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { features } from '@/shared/config/features'
import { appConfig } from '@/shared/config/app'

/**
 * Navigation item type
 */
type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

/**
 * Navigation items configuration
 * Items are conditionally included based on feature flags
 */
const navItems: NavItem[] = [
  // Home is always visible
  {
    label: 'Home',
    href: '/dashboard',
    icon: Home,
  },
  // AI Chat
  {
    label: 'AI Chat',
    href: '/dashboard/chat',
    icon: MessageSquare,
  },

  // Settings removed from sidebar - already in user dropdown menu

  // Development tools (only in dev or when explicitly enabled)
  ...(features.devTools && features.components
    ? [
        {
          label: 'Components',
          href: '/dashboard/components',
          icon: Component,
        },
      ]
    : []),

  ...(features.devTools && features.styleGuide
    ? [
        {
          label: 'Style Guide',
          href: '/dashboard/style-guide',
          icon: Palette,
        },
      ]
    : []),
]

/**
 * Sidebar component - desktop navigation
 */
function Sidebar() {
  const location = useLocation()

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-background">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-border px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
            <span className="text-primary">⚡</span>
            <span>{appConfig.name}</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href

            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}

/**
 * Mobile sidebar - sheet component
 */
function MobileSidebar() {
  const location = useLocation()
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-border px-6">
            <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
              <span className="text-primary">⚡</span>
              <span>{appConfig.name}</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.href

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Header component - top navigation bar
 */
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
      // Logged in: update preferences in database
      const currentMode = preferences.mode
      const newMode = currentMode === 'dark' ? 'light' : 'dark'

      updatePreferences.mutate({
        theme: preferences.theme,
        mode: newMode,
      })
    } else {
      // Not logged in: use localStorage
      setTheme(theme === 'dark' ? 'light' : 'dark')
    }
  }

  // Get user initials for avatar fallback
  const userInitials = session?.user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U'

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background px-4 md:px-6">
      {/* Mobile menu toggle */}
      <MobileSidebar />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <Button variant="ghost" size="icon" onClick={toggleTheme}>
        {theme === 'dark' ? (
          <Sun className="h-5 w-5" />
        ) : (
          <Moon className="h-5 w-5" />
        )}
        <span className="sr-only">Toggle theme</span>
      </Button>

      {/* User menu */}
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
              <p className="text-xs leading-none text-muted-foreground">
                {session?.user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/dashboard/profile')}>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/dashboard/settings?tab=security')}>
            <Shield className="mr-2 h-4 w-4" />
            <span>Security</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/dashboard/settings?tab=settings')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/dashboard/admin')}>
                <Shield className="mr-2 h-4 w-4" />
                <span>Admin</span>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

/**
 * Dashboard layout wrapper
 * Provides consistent layout with sidebar and header for all dashboard pages
 */
export function DashboardLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col md:pl-64">
        <Header />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
