import { createContext, useContext, useEffect, useState } from 'react'
import { useSession } from '@/client/lib/auth'
import { usePreferences } from '@/client/modules/settings/hooks/useSettings'
import { applyTheme } from '@/lib/themes'
import { defaultPreferences } from '@/shared/schemas/preferences.schema'
import { features, fixedTheme } from '@/shared/config/features'

type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'vite-ui-theme',
  ...props
}: ThemeProviderProps) {
  const { data: session } = useSession()
  const { data: preferences } = usePreferences()

  // Local state for non-logged-in users (localStorage fallback)
  const [localTheme, setLocalTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )

  // Apply theme whenever session or preferences change
  useEffect(() => {
    // When theme selector is disabled, always use the fixed theme
    const effectiveTheme = features.themeSelector
      ? (session && preferences ? preferences.theme : defaultPreferences.theme)
      : fixedTheme

    const effectiveMode = session && preferences ? preferences.mode : localTheme

    applyTheme(effectiveTheme, effectiveMode)
  }, [session, preferences, localTheme])

  // For backwards compatibility with components that use setTheme directly
  // This only affects non-logged-in users (logged-in users should use PreferencesSection)
  const handleSetTheme = (theme: Theme) => {
    if (!session) {
      // Not logged in: save to localStorage
      localStorage.setItem(storageKey, theme)
      setLocalTheme(theme)
    }
    // If logged in, this is a no-op (use PreferencesSection to change theme)
  }

  const value = {
    theme: session && preferences ? preferences.mode : localTheme,
    setTheme: handleSetTheme,
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
