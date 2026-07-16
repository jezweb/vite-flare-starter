# dropdown-menu

2026-07-16, transformation engine (legacy style `new-york`, classification only — CUSTOMIZED). Verdict: radix `DropdownMenu` → Base UI `Menu`, Content rebuilt as Portal>Positioner>Popup, 17 consumer files fixed (asChild→render, onSelect→onClick).

## Changed

- `src/components/ui/dropdown-menu.tsx` — import `radix-ui` → `@base-ui/react/menu` (`Menu as DropdownMenuPrimitive`).
  - `DropdownMenuContent`: Portal > Positioner (`isolate z-50 outline-none`, forwards destructured `align`/`alignOffset`/`side`/`sideOffset` — positioner FORWARD rule; `sideOffset` default kept at 4) > Popup. Class rewrites: `max-h-(--radix-…-available-height)` → `max-h-(--available-height)`, `origin-(--radix-…-transform-origin)` → `origin-(--transform-origin)`, `data-[state=open/closed]:` → `data-open:`/`data-closed:` (animate-in/out rekeyed, batch-2 idiom); added `outline-none` on Popup.
  - `DropdownMenuCheckboxItem`/`DropdownMenuRadioItem`: `ItemIndicator` → `CheckboxItemIndicator`/`RadioItemIndicator` (part split).
  - `DropdownMenuSub`/`SubTrigger`: → `SubmenuRoot`/`SubmenuTrigger`; SubTrigger open styling `data-[state=open]:` → `data-popup-open:`.
  - `DropdownMenuSubContent`: now composes `DropdownMenuContent` with the load-bearing submenu defaults `align="start" alignOffset={-3} side="right" sideOffset={0}` (wrapper-shapes.md), keeping our radix SubContent class list (rekeyed) — tailwind-merge resolves the overlaps.
  - `DropdownMenuLabel`: renders a **plain `<div role="presentation">`**, NOT `Menu.GroupLabel` — verified in `MenuGroupContext.js` that GroupLabel throws outside `<Menu.Group>`, and all 6 label-consuming files float labels directly in Content (radix Label allowed this). Documented in a code comment; switch to GroupLabel per-surface if group aria-labelledby wiring is wanted.
- Consumer sweep (17 files):
  - `asChild` → `render` on triggers: nav-user.tsx (also `data-[state=open]:bg-sidebar-accent…` → `data-popup-open:…` and `w-(--radix-dropdown-menu-trigger-width)` → `w-(--anchor-width)`), NotificationBell.tsx (also `DropdownMenuItem asChild><Link…` → `render={<Link…/>}`), MarkdownField.tsx, prompt-input.tsx (PromptInputActionMenuTrigger), DataTable.tsx, OrgSwitcher.tsx (also `--radix-dropdown-menu-trigger-width` → `--anchor-width`), MembersList.tsx, ConversationSidebar.tsx (×2), ChatPage.tsx, DetailPage.tsx, ProjectPage.tsx, MessageMoreMenu.tsx, SpaceHeaderMenu.tsx, UserList.tsx, FileList.tsx, SkillsPage.tsx, ComponentsPage.tsx, StyleGuidePage.tsx.
  - `onSelect` → `onClick` on items (Base UI items have NO onSelect; leaving it would silently bind the DOM select event): ConversationSidebar.tsx (×6), ProjectPage.tsx (×3), prompt-input.tsx (AddAttachments — `preventDefault` keep-open intent → `closeOnClick={false}`; AddScreenshot — caller hook renamed `onSelect` → `onClick` prop), ScreenCaptureMenuItems.tsx (×2 — `event.preventDefault()` removed from `startPicker`/`startConfig`, `closeOnClick={false}` preserves menu-stays-open while native picker opens).

Leftover scan: `grep -n "radix|asChild"` across all 20 touched files — only explanatory comments remain; no radix imports, vars, or props.

## Left alone

- `src/components/ui/sidebar.tsx` — final batch; it does not consume dropdown-menu.
- `MessageRenderer.tsx:440` `group-data-[state=open]/collapsible` — keyed on collapsible (batch 1 scope), not dropdown.

## Behavior changes

- **Checkbox/Radio items no longer close the menu on click by default** (Base UI `closeOnClick` defaults false for those two item types; radix closed). Affects nav-user's "Builder mode" checkbox item and DataTable's column-visibility checkboxes — arguably better UX for toggles (matches the base registry); flagged, not patched.
- `PromptInputActionAddScreenshot`'s public prop changed `onSelect` → `onClick` (API break for forks composing it; no internal caller passed it).
- Menu opens on trigger interaction identically, but `onOpenChange` gains `(open, eventDetails)`; controlled usage in ConversationSidebar is single-arg and unaffected.
- Base UI loops item focus by default (`loopFocus` true; radix `loop` was false-by-default) — arrow-key wrap at menu ends is new.
- DropdownMenuLabel loses GroupLabel semantics (plain div) — visual and radix-parity identical.

## Verify by hand

1. Sidebar footer user menu: opens right-aligned beside the rail, width matches trigger (`--anchor-width`), open-state background on the trigger button, Settings/Sign-out items navigate and close.
2. Chat sidebar conversation "…" menu: Rename/Delete work; "Move to project" submenu flies out to the right, correctly aligned to its trigger row; submenu items move the conversation.
3. Notification bell: badge button opens 80-wide panel; "View all notifications" is a link item that navigates.
4. DataTable "Columns" menu: toggling column checkboxes keeps the menu OPEN (new default) and check marks update.
5. Chat input "+" menu: "Add photos or files" opens the file dialog (menu stays open, radix parity), "Take screenshot" captures and closes.
