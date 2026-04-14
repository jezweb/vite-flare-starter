/**
 * SiteHeader — top bar for the dashboard.
 *
 * Adapted from shadcn dashboard-01: sidebar trigger, separator,
 * then our notifications + theme toggle on the right.
 */
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/client/components/theme-provider'
import { useSession } from '@/client/lib/auth'
import { usePreferences, useUpdatePreferences } from '@/client/modules/settings/hooks/useSettings'
import { NotificationBell } from '@/client/components/NotificationBell'
import { features } from '@/shared/config/features'

export function SiteHeader() {
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
    <header className="flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <div className="ml-auto flex items-center gap-2">
          {features.notifications && <NotificationBell />}
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
