# context-menu

2026-07-16, transformation engine (legacy style `new-york`, classification only). Verdict: radix `ContextMenu` → Base UI `ContextMenu` (Menu part set), Content rebuilt as Portal>Positioner>Popup with pointer-anchor defaults; 1 consumer file fixed.

## Changed

- `src/components/ui/context-menu.tsx` — import `radix-ui` → `@base-ui/react/context-menu`.
  - `ContextMenuContent`: Portal > Positioner (`isolate z-50 outline-none`) > Popup. Hoisted `align="start" alignOffset={4} side="right" sideOffset={0}` defaults per the live base-nova golden — with a pointer anchor these place the popup's top-left at the cursor, the standard context-menu position (radix Content had no side/align props at all). Class rewrites: `--radix-context-menu-*` vars → `--available-height`/`--transform-origin`, `data-[state=open/closed]:` → `data-open:`/`data-closed:`; `outline-none` added on Popup.
  - `ContextMenuSubContent`: minimal compose of `ContextMenuContent` (golden shape) — `side="right"` + `shadow-lg`; inherits align="start"/alignOffset=4 from Content defaults.
  - `Sub`/`SubTrigger` → `SubmenuRoot`/`SubmenuTrigger`; SubTrigger `data-[state=open]:` → `data-popup-open:`.
  - Checkbox/Radio indicators split to `CheckboxItemIndicator`/`RadioItemIndicator`.
  - `ContextMenuLabel`: plain `<div role="presentation">` (same reasoning as dropdown-menu — `GroupLabel` throws outside a Group; radix Label floated freely).
- `src/client/modules/inbox/components/rows/shared.tsx` (only consumer):
  - `ContextMenuTrigger asChild><ListRow…>` → `render={<ListRow…/>}` with row content as trigger children (ListRow spreads props, so trigger wiring merges as it did through radix Slot).
  - `onSelect` → `onClick` on 5 items (mark read/select/review approval/copy id/archive) — Base UI items have no onSelect; leaving it would bind the DOM select event and never fire.

Leftover scan: `grep -n "radix-ui|@radix-ui|asChild|onSelect"` clean on both files.

## Left alone

- No other consumers exist. ComponentsPage/StyleGuidePage do not demo context-menu.

## Behavior changes

- Radix `modal` on Root and `disabled` on Trigger no longer exist — neither was used.
- Base UI Trigger renders a `<div>` and also opens on touch long-press (radix required a pointer-type-specific handler) — the trigger here renders ListRow via `render`, so no extra wrapper div is introduced.
- Item focus loops by default (`loopFocus`).
- ContextMenu SubContent alignment: Base UI submenu anchors with align="start"/alignOffset=4 (golden defaults) vs radix's internal geometry — visually near-identical, worth an eyeball.

## Verify by hand

1. Inbox: right-click a row — menu opens with its top-left corner at the cursor; all items (Mark read, Select, Copy row ID, Archive) fire and close the menu.
2. Right-click near the right/bottom viewport edge — menu flips inside the viewport (collision avoidance).
3. Touch device / responsive mode: long-press a row — menu opens.
4. Left-click still selects/opens the row (trigger render merge preserved onClick).
