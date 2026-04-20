import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { applyTheme, decodeThemeFromURL } from '@/lib/themes'
import { usePreferences, useUpdatePreferences } from '@/client/modules/settings/hooks/useSettings'
import { defaultPreferences, type CustomThemeColors } from '@/shared/schemas/preferences.schema'

/**
 * Applies a theme from the current URL (`?theme=<base64>`) on mount.
 *
 * Visual apply happens immediately so anonymous visitors see the shared theme.
 * If the visitor is signed in, the theme is also saved to their preferences.
 * Either way the `?theme=` param is cleared from the URL afterwards.
 *
 * Render this once, high in the tree.
 */
export function ThemeURLHandler() {
  const handled = useRef(false)
  const { data: preferences } = usePreferences()
  const updatePreferences = useUpdatePreferences()

  useEffect(() => {
    if (handled.current) return
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const encoded = params.get('theme')
    if (!encoded) return

    handled.current = true
    const result = decodeThemeFromURL(encoded)

    // Always strip the param so a refresh doesn't re-apply every time
    params.delete('theme')
    const clean = window.location.pathname + (params.toString() ? `?${params}` : '') + window.location.hash
    window.history.replaceState(null, '', clean)

    if (!result.ok) {
      toast.error(`Theme link invalid: ${result.error}`)
      return
    }

    const customTheme = {
      light: (result.envelope.light ?? result.envelope.dark) as CustomThemeColors,
      dark: (result.envelope.dark ?? result.envelope.light) as CustomThemeColors,
    }

    const mode = preferences?.mode ?? defaultPreferences.mode
    applyTheme('custom', mode, customTheme)

    // Try to save — will no-op / 401 if not signed in, which is fine
    if (preferences) {
      updatePreferences
        .mutateAsync({ ...preferences, theme: 'custom', customTheme })
        .then(() => toast.success('Theme loaded from link and saved'))
        .catch(() => toast.success('Theme applied. Sign in to save it.'))
    } else {
      toast.success('Theme applied. Sign in to save it.')
    }
  }, [preferences, updatePreferences])

  return null
}
