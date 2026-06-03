import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { applyTheme, decodeThemeFromURL, mergeThemeEnvelope } from '@/lib/themes'
import { useSession } from '@/client/lib/auth'
import { usePreferences, useUpdatePreferences } from '@/client/modules/settings/hooks/useSettings'
import { defaultPreferences } from '@/shared/schemas/preferences.schema'

/**
 * Applies a theme from the current URL (`?theme=<base64>`) on mount.
 *
 * If the visitor is signed in, the handler waits for preferences to load so
 * it can save the imported theme immediately — otherwise the ThemeProvider's
 * own useEffect would re-apply the stale saved theme on top of it. Anonymous
 * visitors get a visual apply only; the param is stripped either way.
 *
 * Render this once, high in the tree.
 */
export function ThemeURLHandler() {
  const handled = useRef(false)
  const { data: session, isPending: sessionPending } = useSession()
  const { data: preferences, isLoading: preferencesLoading } = usePreferences()
  const updatePreferences = useUpdatePreferences()

  useEffect(() => {
    if (handled.current) return
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const encoded = params.get('theme')
    if (!encoded) return

    // Wait for session to settle so we can decide whether to save.
    if (sessionPending) return
    // If signed in, wait for preferences to load before we apply — otherwise
    // the ThemeProvider's useEffect will overwrite us with the stale theme.
    if (session && preferencesLoading) return

    handled.current = true
    const result = decodeThemeFromURL(encoded)

    // Always strip the param so a refresh doesn't re-apply every time
    params.delete('theme')
    const clean =
      window.location.pathname + (params.toString() ? `?${params}` : '') + window.location.hash
    window.history.replaceState(null, '', clean)

    if (!result.ok) {
      toast.error(`Theme link invalid: ${result.error}`)
      return
    }

    const customTheme = mergeThemeEnvelope(result.envelope, preferences?.customTheme)

    const mode = preferences?.mode ?? defaultPreferences.mode
    applyTheme('custom', mode, customTheme)

    if (session && preferences) {
      updatePreferences
        .mutateAsync({ ...preferences, theme: 'custom', customTheme })
        .then(() => toast.success('Theme loaded from link and saved'))
        .catch(() => toast.success('Theme applied. Could not save it.'))
    } else {
      toast.success('Theme applied. Sign in to save it.')
    }
  }, [session, sessionPending, preferences, preferencesLoading, updatePreferences])

  return null
}
