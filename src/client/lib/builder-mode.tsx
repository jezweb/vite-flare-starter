/**
 * Builder Mode — a localStorage-backed toggle that reveals
 * developer-facing surfaces (Components, Style Guide, Voice/Video
 * examples, technical disclosures) for fork-authors and AI builders
 * without cluttering the day-to-day user experience.
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
 * ## Default
 *
 * **ON for the starter**, configurable per-fork via `VITE_DEFAULT_BUILDER_MODE`:
 *
 *   - The starter's audience is fork-authors / explorers — defaulting
 *     OFF means they never discover the dev surfaces (Components,
 *     Style guide, etc.) that exist specifically to help them build.
 *   - Forks shipping a polished product to non-builder end users
 *     (e.g. an insurance broker tool) set `VITE_DEFAULT_BUILDER_MODE=false`
 *     in `.dev.vars` / wrangler env. End users never see Builder
 *     section unless they explicitly toggle it on.
 *
 * The localStorage flag, if present, ALWAYS wins over the env default.
 * That preserves a returning user's last choice across deploys.
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

/**
 * Resolve the fork-author default — `VITE_DEFAULT_BUILDER_MODE='false'`
 * flips it off; anything else (including unset) keeps it on.
 *
 * Read once at module load — Vite inlines `import.meta.env.*` at build
 * time, so this is effectively a constant per deploy.
 */
const FORK_DEFAULT_ON: boolean =
  (import.meta.env['VITE_DEFAULT_BUILDER_MODE'] as string | undefined) !== 'false'

function readInitial(): boolean {
  if (typeof window === 'undefined') return FORK_DEFAULT_ON
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') return true
    if (stored === 'false') return false
    return FORK_DEFAULT_ON
  } catch {
    return FORK_DEFAULT_ON
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
