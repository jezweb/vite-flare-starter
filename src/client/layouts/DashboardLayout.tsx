/**
 * Dashboard Layout — composed from shadcn dashboard-01 primitives.
 *
 * Pieces live at top level for clarity and easy customisation:
 * - components/app-sidebar.tsx → driven by nav.ts
 * - components/nav-main.tsx    → primary section renderer
 * - components/nav-user.tsx    → account menu in footer
 * - components/site-header.tsx → top bar
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { CommandPalette } from '@/client/components/CommandPalette'
import { KeyboardShortcuts } from '@/client/components/KeyboardShortcuts'
import { EmailVerificationBanner } from '@/client/components/EmailVerificationBanner'
import { NAV_SECTIONS } from '@/shared/config/nav'
import { appConfig } from '@/shared/config/app'
import { useEnsureTimezone } from '@/client/modules/settings/hooks/useEnsureTimezone'

/**
 * Invisible mount — fires browser-timezone auto-detection once per app
 * load for users who haven't set `preferences.timezone` explicitly.
 * Lives on every dashboard page via the layout, so the next sign-in
 * after install populates the field without surfacing a UI prompt.
 */
function TimezoneAutoDetect() {
  useEnsureTimezone()
  return null
}

// Fallback title resolver. The PageHeader primitive sets document.title
// on each page mount via useEffect; this layout-level sync is the safety
// net for routes that haven't adopted PageHeader yet AND for the brief
// moment between route transition and PageHeader mount.
//
// Match strategy: prefer EXACT path match in the nav config. Don't
// fall back to longest-prefix because `/dashboard` (Home) is a prefix
// of every dashboard route — that was the original cause of the
// "Home · Vite Flare Starter" title appearing on every page that
// hadn't adopted PageHeader. Pages outside the nav (Settings, Admin,
// Organization) get a Title-Cased derivation from the last segment.
function resolveTitle(pathname: string): string | null {
  const items = NAV_SECTIONS.flatMap((s) => s.items)
  // Exact match first — handles all nav items including /dashboard.
  const exact = items.find((i) => i.to === pathname)
  if (exact) return exact.label
  // Then prefix match excluding the bare /dashboard root, so children
  // like /dashboard/chat/abc still pick up the "AI Chat" parent title.
  const prefix = items
    .filter((i) => i.to !== '/dashboard' && pathname.startsWith(i.to + '/'))
    .sort((a, b) => b.to.length - a.to.length)[0]
  if (prefix) return prefix.label
  // Last resort: derive from final non-dashboard segment.
  const segments = pathname.split('/').filter(Boolean)
  const last = segments[segments.length - 1]
  if (!last || last === 'dashboard') return null
  return last
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function DocumentTitleSync() {
  const { pathname } = useLocation()
  useEffect(() => {
    const title = resolveTitle(pathname)
    document.title = title ? `${title} · ${appConfig.name}` : appConfig.name
  }, [pathname])
  return null
}

/**
 * Auto-collapse the sidebar to icon-only mode below the tablet
 * breakpoint (1024px). Above 1024px the sidebar starts expanded.
 *
 * Why a controlled `open` prop (vs. the cookie-driven default):
 *   - The shadcn primitive's `useIsMobile` boundary is 768px, so
 *     between 768-1024 the sidebar stays expanded and crowds the
 *     content area (P3-006). We want icon-mode on tablets without
 *     bumping the global mobile breakpoint (which also drives chart
 *     tick density).
 *   - Below 768 the primitive already swaps in a Sheet (offcanvas),
 *     so this hook only matters at 768-1023.
 *
 * User override: once they toggle the sidebar, we stop reacting to
 * viewport changes for the rest of the session — the explicit choice
 * wins. New tab/load picks the responsive default again.
 */
function useResponsiveSidebarOpen(): {
  open: boolean
  onOpenChange: (next: boolean) => void
} {
  const computeDefault = () =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1024
  const [open, setOpen] = useState<boolean>(computeDefault)
  const userOverrideRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(min-width: 1024px)')
    const sync = () => {
      if (userOverrideRef.current) return
      setOpen(mql.matches)
    }
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [])

  const onOpenChange = (next: boolean) => {
    userOverrideRef.current = true
    setOpen(next)
  }

  return { open, onOpenChange }
}

export function DashboardLayout() {
  const { open, onOpenChange } = useResponsiveSidebarOpen()
  return (
    <div className="h-svh overflow-hidden">
      <SidebarProvider
        open={open}
        onOpenChange={onOpenChange}
        className="h-full"
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 72)',
            '--header-height': 'calc(var(--spacing) * 14)',
          } as CSSProperties
        }
      >
        {/* Skip-to-main-content — visible only on keyboard focus, lets
            users bypass the 9-item sidebar nav on every page. First focusable
            element. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <AppSidebar />
        <CommandPalette />
        <KeyboardShortcuts />
        <DocumentTitleSync />
        <TimezoneAutoDetect />
        <SidebarInset className="flex h-full min-w-0 flex-col">
          <SiteHeader />
          <EmailVerificationBanner />
          <main id="main-content" tabIndex={-1} className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-4 md:p-6">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
