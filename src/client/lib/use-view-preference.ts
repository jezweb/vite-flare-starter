/**
 * useViewPreference — persist a user's preferred layout view per surface.
 *
 * Scoped to `appConfig.id + surfaceKey` so different list pages don't
 * collide in localStorage when forks rebrand. SSR-safe (returns the
 * default until first effect run).
 *
 * Use for view-toggle UIs (cards / list / table) where the choice is a
 * personal preference that should survive reloads. Don't use for state
 * that should sync across devices — that belongs in user.preferences.
 *
 * @example
 *   const [view, setView] = useViewPreference<'cards' | 'list'>('skills', 'cards')
 *   <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as 'cards' | 'list')}>
 *     <ToggleGroupItem value="cards">…</ToggleGroupItem>
 *     <ToggleGroupItem value="list">…</ToggleGroupItem>
 *   </ToggleGroup>
 */
import { useEffect, useState } from 'react'

import { appConfig } from '@/shared/config/app'

export function useViewPreference<T extends string>(
  surfaceKey: string,
  defaultView: T,
): [T, (next: T) => void] {
  const storageKey = `${appConfig.id}-view-${surfaceKey}`
  const [view, setView] = useState<T>(defaultView)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) setView(stored as T)
    } catch {
      // localStorage unavailable (private browsing, quota exceeded) — use default
    }
  }, [storageKey])

  function update(next: T) {
    setView(next)
    try {
      window.localStorage.setItem(storageKey, next)
    } catch {
      // ignore — view still updates in-memory
    }
  }

  return [view, update]
}
