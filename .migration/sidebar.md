# sidebar

2026-07-16, transformation engine (legacy new-york style — classes kept verbatim except stale radix state selectors), Slot machinery migrated to useRender+mergeProps. Verdict: clean; build green.

## Changed

- `src/components/ui/sidebar.tsx` — five parts used `Slot.Root` + `asChild`; all rewired to `useRender` + `mergeProps` with the `render` prop:
  - `SidebarGroupLabel` (`useRender.ComponentProps<'div'>`)
  - `SidebarGroupAction` (`'button'`)
  - `SidebarMenuButton` (`'button'`) — the tooltip composition is untouched: `useRender` result is assigned to `button` and passed to the already-Base-UI `TooltipTrigger render={button}` exactly as before
  - `SidebarMenuAction` (`'button'`)
  - `SidebarMenuSubButton` (`'a'`)
- Stale radix data-state selectors updated per class-mapping (these fire when the button/action is a Base UI DropdownMenuTrigger's render target):
  - `sidebarMenuButtonVariants`: `data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground` → `data-popup-open:hover:*` (sidebar.tsx:461)
  - `SidebarMenuAction` showOnHover: `data-[state=open]:opacity-100` → `data-popup-open:opacity-100`
  - Consumers were already written against this (`nav-user.tsx` styles `data-popup-open:*` at the call site and passes `DropdownMenuTrigger render={<SidebarMenuButton/>}`) — the wrapper had lagged behind batch 3.
- `src/components/nav-main.tsx:53` — the one `asChild` call site: `<SidebarMenuButton asChild><NavLink…>content</NavLink></SidebarMenuButton>` → `<SidebarMenuButton render={<NavLink…/>}>content</SidebarMenuButton>`. Comment in the same file referencing "render on SidebarGroupLabel" already matched the new API.

Behavior-class audit (attributes still exist):
- `group-data-[collapsible=icon|offcanvas]`, `group-data-[side=*]`, `group-data-[variant=*]`, `data-state=expanded|collapsed` — all set by our own `Sidebar` aside element (untouched) ✓
- `peer-data-[variant=inset]` / `peer-data-[state=collapsed]` in `SidebarInset` key on that same aside ✓
- `peer-data-[size=*]/menu-button`, `peer-data-[active=true]/menu-button` key on `data-size`/`data-active` — preserved through mergeProps ✓
- Mobile Sheet + Tooltip compositions were already on Base UI (batch 2/3) ✓

Leftover scan: `grep -n "radix-ui\|@radix-ui\|asChild\|Slot" src/components/ui/sidebar.tsx src/components/nav-main.tsx` → no matches.

## Left alone

- All non-Slot parts (Provider, Sidebar, Trigger, Rail, Inset, Input, Header, Footer, Content, Group, Menu, MenuItem, MenuBadge, MenuSkeleton, MenuSub, MenuSubItem) — plain elements or compositions of already-migrated wrappers.

## Behavior changes

None intended. The `data-popup-open` rename is the Base UI equivalent of the radix `data-[state=open]` trigger marker — same visual (accent stays while a menu anchored to the button is open); it had been dead CSS since the menus migrated in batch 2.

## Verify by hand

- Cmd/Ctrl+B toggles collapse; icon-collapse hides labels with the margin/opacity transition; offcanvas slides.
- Collapsed sidebar: hover a menu button → tooltip appears to the right (and not when expanded).
- Nav links (nav-main) render as anchors, active route highlighted, keyboard Tab + Enter navigates.
- User menu (nav-user) and OrgSwitcher: while their dropdown is open, the trigger button keeps the accent background (`data-popup-open`).
- Mobile viewport: sidebar opens in the Sheet with slide animation.
