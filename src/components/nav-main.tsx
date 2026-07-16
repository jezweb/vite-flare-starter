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
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { NavItem } from '@/shared/config/nav'

/**
 * Kumo MenuBadge — dashed pill after a nav label ("Beta", "New").
 * Hidden when the sidebar collapses to icons.
 */
function NavBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto inline-flex shrink-0 select-none items-center rounded-full border border-dashed border-border px-1.5 py-0.5 text-[11px]/none font-medium group-data-[collapsible=icon]:hidden">
      {children}
    </span>
  )
}

interface Props {
  label: string
  items: NavItem[]
  /** If true, render the section as a Collapsible that starts closed. */
  defaultCollapsed?: boolean
}

function routeMatches(pathname: string, to: string): boolean {
  return pathname === to || (to !== '/dashboard' && pathname.startsWith(to + '/'))
}

export function NavMain({ label, items, defaultCollapsed = false }: Props) {
  const location = useLocation()

  // If a route inside this group is active, force the group open even
  // if it's marked defaultCollapsed — otherwise the user lands on a
  // page they navigated to from somewhere else and the sidebar gives
  // no indication of where they are.
  const hasActiveItem = items.some(
    (item) =>
      routeMatches(location.pathname, item.to) ||
      item.children?.some((child) => routeMatches(location.pathname, child.to))
  )

  const list = (
    <SidebarMenu>
      {items.map((item) =>
        item.children && item.children.length > 0 ? (
          <NestedNavItem key={item.to} item={item} pathname={location.pathname} />
        ) : (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton
              render={<NavLink to={item.to} end={item.to === '/dashboard'} />}
              isActive={routeMatches(location.pathname, item.to)}
              tooltip={item.label}
            >
              {item.icon && <item.icon />}
              <span>{item.label}</span>
              {item.badge && <NavBadge>{item.badge}</NavBadge>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      )}
    </SidebarMenu>
  )

  // A section whose only item is a nested parent sharing the section's
  // name (e.g. Insights) would render "Insights ▸ Insights" — the item
  // carries its own collapse, so skip the group chrome entirely.
  const only = items.length === 1 ? items[0] : undefined
  const singleNestedSelf = !!only?.children?.length && only.label === label
  if (singleNestedSelf) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>{list}</SidebarGroupContent>
      </SidebarGroup>
    )
  }

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
 * Cloudflare-dashboard-style nested item: icon'd parent that BOTH
 * navigates (to its overview route) and expands; text-only children
 * indented behind the vertical rail (see SidebarMenuSub). The parent
 * shows active styling only for its own route — when a child is
 * active, the child carries the highlight (Kumo behaviour).
 */
function NestedNavItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const children = item.children ?? []
  const parentActive = routeMatches(pathname, item.to)
  const childActive = children.some((c) => routeMatches(pathname, c.to))
  const [open, setOpen] = useState(parentActive || childActive)

  // Navigating into the subtree from elsewhere (command palette, deep
  // link) must reveal where the user is.
  useEffect(() => {
    if (parentActive || childActive) setOpen(true)
  }, [parentActive, childActive])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <SidebarMenuButton
          render={<NavLink to={item.to} onClick={() => setOpen(true)} />}
          isActive={parentActive}
          tooltip={item.label}
        >
          {item.icon && <item.icon />}
          <span>{item.label}</span>
          {item.badge && <NavBadge>{item.badge}</NavBadge>}
        </SidebarMenuButton>
        <CollapsibleTrigger
          render={
            <button
              type="button"
              aria-label={`${open ? 'Collapse' : 'Expand'} ${item.label}`}
              className="absolute top-1.5 right-1 flex size-5 items-center justify-center rounded-md text-sidebar-foreground/60 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden"
            />
          }
        >
          <CaretRight
            className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {children.map((child) => (
              <SidebarMenuSubItem key={child.to}>
                <SidebarMenuSubButton
                  render={<NavLink to={child.to} />}
                  isActive={routeMatches(pathname, child.to)}
                >
                  <span>{child.label}</span>
                  {child.badge && <NavBadge>{child.badge}</NavBadge>}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
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
        {/*
         * Render as a real <button> so the trigger is keyboard-focusable
         * out of the box (tabIndex=0, Enter/Space activate). render on
         * SidebarGroupLabel would produce a div that's invisible to Tab.
         * Reuses the SidebarGroupLabel styling via the same class string.
         */}
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="flex h-8 w-full shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/80 ring-sidebar-ring outline-hidden transition-[margin,opacity,colors] duration-200 ease-linear hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 [&>svg]:size-4 [&>svg]:shrink-0"
            />
          }
        >
          <span>{label}</span>
          <CaretDown
            className={`ml-auto size-3.5 transition-transform ${
              effectiveOpen ? 'rotate-0' : '-rotate-90'
            }`}
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  )
}
