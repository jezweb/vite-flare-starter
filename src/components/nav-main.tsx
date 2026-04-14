/**
 * NavMain — primary navigation section for the sidebar.
 *
 * Adapted from shadcn dashboard-01. Reads from our `nav.ts` config
 * so items are filterable by feature flags + user role.
 */
import { NavLink, useLocation } from 'react-router-dom'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { NavItem } from '@/shared/config/nav'

interface Props {
  label: string
  items: NavItem[]
}

export function NavMain({ label, items }: Props) {
  const location = useLocation()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive =
              location.pathname === item.to ||
              (item.to !== '/dashboard' && location.pathname.startsWith(item.to + '/'))
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                  <NavLink to={item.to} end={item.to === '/dashboard'}>
                    {item.icon && <item.icon />}
                    <span>{item.label}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
