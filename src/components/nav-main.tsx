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
import { useEffect, useState } from 'react'
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
    <CollapsibleSection label={label} forceOpen={hasActiveItem} defaultCollapsed={defaultCollapsed}>
      {list}
    </CollapsibleSection>
  )
}

/**
 * Per-section collapse state persists in localStorage so the user's
 * choice survives page reloads. Onboarding-relevant sections (Setup)
 * default open for first-time users — see `firstTimeOpenSections`.
 */
const firstTimeOpenSections = new Set(['Setup'])

function storageKey(label: string): string {
  return `nav.section.${label.toLowerCase().replace(/\s+/g, '-')}.open`
}

function CollapsibleSection({
  label,
  forceOpen,
  defaultCollapsed,
  children,
}: {
  label: string
  forceOpen: boolean
  defaultCollapsed: boolean
  children: React.ReactNode
}) {
  // Hydrate from localStorage. First-time users see onboarding-relevant
  // sections (Setup) expanded by default — discoverability beats
  // sidebar minimalism on day 1. Returning users see whatever they
  // last set.
  const initialOpen = (() => {
    if (typeof window === 'undefined') return false
    const stored = window.localStorage.getItem(storageKey(label))
    if (stored === 'true') return true
    if (stored === 'false') return false
    // No stored value → first visit. Override defaultCollapsed for
    // sections in firstTimeOpenSections so the user can find them.
    return firstTimeOpenSections.has(label) ? true : !defaultCollapsed
  })()

  const [open, setOpen] = useState(initialOpen)

  // Persist the user's explicit toggles. Don't write on initial mount
  // (no value yet → leave the absence as the signal); only write when
  // open actually changes from a user click.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey(label), open ? 'true' : 'false')
  }, [label, open])

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
            aria-expanded={effectiveOpen}
            className="flex h-8 w-full shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/80 ring-sidebar-ring outline-hidden transition-[margin,opacity,colors] duration-200 ease-linear hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 [&>svg]:size-4 [&>svg]:shrink-0"
          >
            <span>{label}</span>
            <ChevronDown
              className={`ml-auto size-3.5 transition-transform ${
                effectiveOpen ? 'rotate-0' : '-rotate-90'
              }`}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  )
}
