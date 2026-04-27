/**
 * AppSidebar — sidebar adapted from shadcn dashboard-01 to our config.
 *
 * Driven by NAV_SECTIONS from nav.ts. Filters items by feature flags
 * and user role. NavUser lives in the footer. Inset variant for the
 * floating sidebar style.
 */
import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { NavMain } from '@/components/nav-main'
import { NavUser } from '@/components/nav-user'
import { useSession } from '@/client/lib/auth'
import { features } from '@/shared/config/features'
import { appConfig } from '@/shared/config/app'
import { NAV_SECTIONS, type NavItem } from '@/shared/config/nav'

function filterItems(
  items: NavItem[],
  featureFlags: Record<string, boolean>,
  userRole?: string,
): NavItem[] {
  return items.filter((item) => {
    if (item.feature && !featureFlags[item.feature]) return false
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
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? 'user'

  const visibleSections = React.useMemo(() => {
    const featureFlags = features as unknown as Record<string, boolean>
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: filterItems(section.items, featureFlags, userRole),
    })).filter((section) => section.items.length > 0)
  }, [userRole])

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
                  {appConfig.logoUrl ? (
                    // Real logo image — fork sets VITE_APP_LOGO_URL.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={appConfig.logoUrl}
                      alt={appConfig.name}
                      className="size-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-bold">{appConfig.name.charAt(0)}</span>
                  )}
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-base font-semibold">{appConfig.name}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {visibleSections.map((section) => (
          <NavMain key={section.label} label={section.label} items={section.items} />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
