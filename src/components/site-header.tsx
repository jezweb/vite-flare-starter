/**
 * SiteHeader — top bar for the dashboard.
 *
 * Adapted from shadcn dashboard-01: sidebar trigger, separator,
 * then our notifications + theme toggle on the right.
 */
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Moon, Sun, Search } from 'lucide-react'
import { useTheme, useResolvedMode } from '@/client/components/theme-provider'
import { useSession } from '@/client/lib/auth'
import { usePreferences, useUpdatePreferences } from '@/client/modules/settings/hooks/useSettings'
import { NotificationBell } from '@/client/components/NotificationBell'
import { features } from '@/shared/config/features'
import { useEffect, useState } from 'react'

export function SiteHeader() {
  const { setTheme } = useTheme()
  const resolvedMode = useResolvedMode()
  const { data: session } = useSession()
  const { data: preferences } = usePreferences()
  const updatePreferences = useUpdatePreferences()

  const toggleTheme = () => {
    // Flip from what's currently rendered, not from the preference value —
    // otherwise clicking while in 'system' mode feels random.
    const newMode = resolvedMode === 'dark' ? 'light' : 'dark'
    if (session && preferences) {
      updatePreferences.mutate({ theme: preferences.theme, mode: newMode })
    } else {
      setTheme(newMode)
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger
          className="-ml-1"
          title="Toggle sidebar (Ctrl/Cmd + B)"
          aria-label="Toggle sidebar"
        />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <div className="ml-auto flex items-center gap-2">
          <CommandPaletteHint />
          {features.notifications && <NotificationBell />}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={resolvedMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={resolvedMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {resolvedMode === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </header>
  )
}

/**
 * Discoverable hint for the Command Palette (Cmd+K / Ctrl+K). On wide
 * screens it's a mini search pill; on narrow viewports it collapses to
 * a pure icon button. Dispatches a synthetic Cmd+K keydown so we don't
 * need to refactor the CommandPalette's internal state.
 */
function CommandPaletteHint() {
  const [isMac, setIsMac] = useState(true)
  useEffect(() => {
    // Platform detection for the shortcut glyph — ⌘ on Mac, Ctrl elsewhere.
    if (typeof navigator !== 'undefined') {
      setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent))
    }
  }, [])

  const trigger = () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: isMac, ctrlKey: !isMac, bubbles: true }),
    )
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: isMac, ctrlKey: !isMac, bubbles: true }),
    )
  }

  return (
    <>
      {/* Wide screens: a claude.ai-style mini search pill. */}
      <button
        type="button"
        onClick={trigger}
        className="hidden sm:inline-flex items-center gap-2 rounded-md border bg-muted/30 hover:bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors"
        aria-label="Open command palette"
        title="Search commands and conversations"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search</span>
        <kbd className="rounded border bg-background px-1 font-mono text-[10px] font-medium text-muted-foreground">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>
      {/* Narrow viewports: icon-only variant so the header doesn't crowd. */}
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        onClick={trigger}
        aria-label="Open command palette"
        title="Search"
      >
        <Search className="h-5 w-5" />
      </Button>
    </>
  )
}
