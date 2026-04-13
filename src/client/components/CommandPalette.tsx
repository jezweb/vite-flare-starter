/**
 * Command Palette (Cmd+K)
 *
 * Global search and navigation. Reads nav items from the same config
 * as the sidebar, plus adds quick actions (theme toggle, sign out).
 *
 * Keyboard: Cmd+K (Mac) or Ctrl+K (Windows/Linux)
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { Moon, Sun, LogOut, Settings } from 'lucide-react'
import { useTheme } from '@/client/components/theme-provider'
import { authClient } from '@/client/lib/auth'
import { NAV_SECTIONS } from '@/shared/config/nav'
import { features } from '@/shared/config/features'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const runCommand = useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  // Filter nav items by feature flags (same logic as sidebar)
  const featureFlags = features as unknown as Record<string, boolean>
  const navItems = NAV_SECTIONS.flatMap((section) =>
    section.items
      .filter((item) => !item.feature || featureFlags[item.feature])
      .map((item) => ({ ...item, section: section.label }))
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem
              key={item.to}
              onSelect={() => runCommand(() => navigate(item.to))}
            >
              {item.icon && <item.icon className="mr-2 h-4 w-4" />}
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Quick Actions */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => navigate('/dashboard/settings'))}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Toggle theme
            <CommandShortcut>Theme</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(async () => {
                await authClient.signOut()
                navigate('/sign-in')
              })
            }
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
