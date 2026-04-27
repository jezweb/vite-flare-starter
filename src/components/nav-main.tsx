/**
 * NavMain — primary navigation section for the sidebar.
 *
 * Adapted from shadcn dashboard-01. Reads from our `nav.ts` config
 * so items are filterable by feature flags + user role.
 *
 * If `defaultCollapsed` is true on the section, the group renders as
 * a Collapsible with the section label as the trigger — used for the
 * "More" cluster so the sidebar leads with the ~6 primary destinations.
 */
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { NavItem } from '@/shared/config/nav'

interface Props {
  label: string
  items: NavItem[]
  /** If true, render the section as a Collapsible that starts closed. */
  defaultCollapsed?: boolean
}

export function NavMain({ label, items, defaultCollapsed = false }: Props) {
  const location = useLocation()

  // If a route inside this group is active, force the group open even
  // if it's marked defaultCollapsed — otherwise the user lands on a
  // page they navigated to from somewhere else and the sidebar gives
  // no indication of where they are.
  const hasActiveItem = items.some(
    (item) =>
      location.pathname === item.to ||
      (item.to !== '/dashboard' && location.pathname.startsWith(item.to + '/')),
  )

  const list = (
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
  )

  if (!defaultCollapsed) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>{list}</SidebarGroupContent>
      </SidebarGroup>
    )
  }

  return (
    <CollapsibleSection label={label} forceOpen={hasActiveItem}>
      {list}
    </CollapsibleSection>
  )
}

function CollapsibleSection({
  label,
  forceOpen,
  children,
}: {
  label: string
  forceOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(forceOpen)
  // Keep open state synced with forceOpen — if the user navigates to a
  // child route, expand the section automatically.
  const effectiveOpen = forceOpen || open

  return (
    <SidebarGroup>
      <Collapsible open={effectiveOpen} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          {/*
            * Render as a real <button> so the trigger is keyboard-focusable
            * out of the box (tabIndex=0, Enter/Space activate). asChild on
            * SidebarGroupLabel produces a div that's invisible to Tab.
            * Reuses the SidebarGroupLabel styling via the same class string.
            */}
          <button
            type="button"
            className="flex h-8 w-full shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4 [&>svg]:shrink-0"
          >
            <span>{label}</span>
            <ChevronDown
              className={`ml-auto size-3.5 transition-transform ${
                effectiveOpen ? 'rotate-0' : '-rotate-90'
              }`}
              aria-hidden="true"
            />
            <span className="sr-only">{effectiveOpen ? 'collapse' : 'expand'} {label}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  )
}
