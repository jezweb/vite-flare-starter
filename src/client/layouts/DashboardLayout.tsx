/**
 * Dashboard Layout — composed from shadcn dashboard-01 primitives.
 *
 * Pieces live at top level for clarity and easy customisation:
 * - components/app-sidebar.tsx → driven by nav.ts
 * - components/nav-main.tsx    → primary section renderer
 * - components/nav-user.tsx    → account menu in footer
 * - components/site-header.tsx → top bar
 */
import type { CSSProperties } from 'react'
import { Outlet } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { CommandPalette } from '@/client/components/CommandPalette'
import { KeyboardShortcuts } from '@/client/components/KeyboardShortcuts'
import { EmailVerificationBanner } from '@/client/components/EmailVerificationBanner'

export function DashboardLayout() {
  return (
    <SidebarProvider
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
      <SidebarInset>
        <SiteHeader />
        <EmailVerificationBanner />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
