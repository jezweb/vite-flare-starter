/**
 * AppSidebar — sidebar adapted from shadcn dashboard-01 to our config.
 *
 * Driven by NAV_SECTIONS from nav.ts. Filters items by feature flags
 * and user role. NavUser lives in the footer. Inset variant for the
 * floating sidebar style.
 */
import * as React from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { NavMain } from '@/components/nav-main'
import { NavUser } from '@/components/nav-user'
import { useSession } from '@/client/lib/auth'
import { useBuilderMode } from '@/client/lib/builder-mode'
import { features } from '@/shared/config/features'
import { OrgSwitcher } from '@/client/modules/organizations/components/OrgSwitcher'
import { NAV_SECTIONS, type NavItem } from '@/shared/config/nav'

function filterItems(
  items: NavItem[],
  featureFlags: Record<string, boolean>,
  userRole: string | undefined,
  isBuilder: boolean
): NavItem[] {
  return items.filter((item) => {
    if (item.feature && !featureFlags[item.feature]) return false
    if (item.builderOnly && !isBuilder) return false
    if (item.minRole) {
      const roleHierarchy: Record<string, number> = { user: 0, manager: 1, admin: 2 }
      const required = roleHierarchy[item.minRole] ?? 0
      const current = roleHierarchy[userRole ?? 'user'] ?? 0
      if (current < required) return false
    }
    return true
  })
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession()
  const { isBuilder } = useBuilderMode()
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? 'user'

  const visibleSections = React.useMemo(() => {
    const featureFlags = features as unknown as Record<string, boolean>
    return NAV_SECTIONS.filter((section) => !section.builderOnly || isBuilder)
      .map((section) => ({
        ...section,
        items: filterItems(section.items, featureFlags, userRole, isBuilder),
      }))
      .filter((section) => section.items.length > 0)
  }, [userRole, isBuilder])

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        {/*
         * Once authed, the sidebar header shows the user's active
         * organisation context (Slack / Linear / Notion convention).
         * The product brand (`appConfig.name` + logo) still appears
         * on public pages and the tab title — it's the platform
         * identity. The sidebar header is the tenant identity.
         */}
        <OrgSwitcher />
      </SidebarHeader>

      <SidebarContent>
        {visibleSections.map((section) => (
          <NavMain
            key={section.label}
            label={section.label}
            items={section.items}
            defaultCollapsed={section.defaultCollapsed}
          />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
