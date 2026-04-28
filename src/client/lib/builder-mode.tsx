/**
 * Builder Mode — a localStorage-backed toggle that reveals
 * developer-facing surfaces (Components, Style Guide, Activity, raw
 * skill source, technical disclosures) for fork-authors and AI
 * builders without cluttering the day-to-day user experience.
 *
 * Read with `useBuilderMode()`. Toggle with the user-menu switch.
 *
 *   const { isBuilder, toggle } = useBuilderMode()
 *   if (isBuilder) { …show Components in sidebar… }
 *
 * State lives in `localStorage.builder-mode` so it persists across
 * page loads but doesn't sync between devices (intentional — it's a
 * per-machine preference, not a per-user role).
 *
 * Builder Mode is NOT the same as the admin role. Admin is
 * server-enforced for shared-state operations (member management,
 * feature flags). Builder is client-only display.
 */
import * as React from 'react'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'builder-mode'

interface BuilderModeContextValue {
  isBuilder: boolean
  toggle: () => void
  setBuilder: (next: boolean) => void
}

const BuilderModeContext = createContext<BuilderModeContextValue | null>(null)

function readInitial(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function BuilderModeProvider({ children }: { children: React.ReactNode }) {
  const [isBuilder, setIsBuilder] = useState<boolean>(readInitial)

  // Sync across tabs — if the user toggles in one window, others follow.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setIsBuilder(e.newValue === 'true')
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const setBuilder = useCallback((next: boolean) => {
    setIsBuilder(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false')
    } catch {
      /* ignored — private browsing */
    }
  }, [])

  const toggle = useCallback(() => setBuilder(!isBuilder), [isBuilder, setBuilder])

  return (
    <BuilderModeContext.Provider value={{ isBuilder, toggle, setBuilder }}>
      {children}
    </BuilderModeContext.Provider>
  )
}

export function useBuilderMode(): BuilderModeContextValue {
  const ctx = useContext(BuilderModeContext)
  if (!ctx) {
    // Allow hooks to be called outside the provider (e.g. on the
    // landing page) without crashing — return a sensible default.
    return { isBuilder: false, toggle: () => {}, setBuilder: () => {} }
  }
  return ctx
}
