/**
 * Dashboard Layout — a thin composition of the <AppShell> primitive.
 *
 * AppShell owns the structural shell (sidebar provider, responsive collapse,
 * skip link, full-height scroll). This file only wires the dashboard's pieces:
 * - components/app-sidebar.tsx → driven by nav.ts
 * - components/site-header.tsx → top bar
 * - the email-verification banner + the invisible mounts (command palette,
 *   keyboard shortcuts, title sync, timezone auto-detect)
 *
 * Want a different shape in a fork? Compose AppShell differently — drop the
 * sidebar, move it to `side="right"`, add a footer, change contentMaxWidth —
 * without touching this file's wiring. See src/components/ui/app-shell.tsx.
 */
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/ui/app-shell'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { CommandPalette } from '@/client/components/CommandPalette'
import { KeyboardShortcuts } from '@/client/components/KeyboardShortcuts'
import { EmailVerificationBanner } from '@/client/components/EmailVerificationBanner'
import { WalkaboutOverlay } from '@/client/modules/walkabout/components/WalkaboutOverlay'
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
  return last.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
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
    <AppShell
      sidebar={<AppSidebar />}
      header={<SiteHeader />}
      banner={<EmailVerificationBanner />}
      overlays={
        <>
          <CommandPalette />
          <KeyboardShortcuts />
          <DocumentTitleSync />
          <TimezoneAutoDetect />
          <WalkaboutOverlay />
        </>
      }
    >
      <Outlet />
    </AppShell>
  )
}
