/**
 * Dashboard Layout — composed from shadcn dashboard-01 primitives.
 *
 * Pieces live at top level for clarity and easy customisation:
 * - components/app-sidebar.tsx → driven by nav.ts
 * - components/nav-main.tsx    → primary section renderer
 * - components/nav-user.tsx    → account menu in footer
 * - components/site-header.tsx → top bar
 */
import { useEffect, type CSSProperties } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { CommandPalette } from '@/client/components/CommandPalette'
import { KeyboardShortcuts } from '@/client/components/KeyboardShortcuts'
import { EmailVerificationBanner } from '@/client/components/EmailVerificationBanner'
import { NAV_SECTIONS } from '@/shared/config/nav'
import { appConfig } from '@/shared/config/app'

// Resolve a human-readable label for the current path by matching against the
// flattened nav config. Longest-prefix wins so `/dashboard/chat/abc` still
// picks up the "AI Chat" title. Falls back to a Title-Cased derivation from
// the last non-dashboard path segment so routes without nav entries still
// produce a sensible tab title.
function resolveTitle(pathname: string): string | null {
  const items = NAV_SECTIONS.flatMap((s) => s.items)
  const match = items
    .filter((i) => pathname === i.to || pathname.startsWith(i.to + '/'))
    .sort((a, b) => b.to.length - a.to.length)[0]
  if (match) return match.label
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

export function DashboardLayout() {
  return (
    <div className="h-svh overflow-hidden">
      <SidebarProvider
        className="h-full"
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 72)',
            '--header-height': 'calc(var(--spacing) * 14)',
          } as CSSProperties
        }
      >
        <AppSidebar />
        <CommandPalette />
        <KeyboardShortcuts />
        <DocumentTitleSync />
        <SidebarInset className="flex h-full min-w-0 flex-col">
          <SiteHeader />
          <EmailVerificationBanner />
          <main className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-4 md:p-6">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
