# popover

2026-07-16, transformation engine (legacy style `new-york`, classification only — file is CUSTOMIZED: PopoverHeader/Title/Description additions). Verdict: Content → Portal>Positioner>Popup with positioning props forwarded; Anchor part removed in favour of a Positioner `anchor` prop; 10 consumer files fixed.

## Changed

- `src/components/ui/popover.tsx` — import `radix-ui` → `@base-ui/react/popover`. `PopoverContent` rebuilt on the Portal > Positioner > Popup anatomy: `align`/`alignOffset`/`side`/`sideOffset`/`anchor` are `Pick`ed from `PopoverPrimitive.Positioner.Props` and each explicitly destructured AND forwarded to the Positioner (positioner FORWARD rule — declare → destructure → forward, all five). Positioner gets `className="isolate z-50"` (no data-slot, per wrapper-shapes conventions); Popup keeps our exact classes with rewrites: `origin-(--radix-popover-content-transform-origin)` → `origin-(--transform-origin)`, `data-[state=open/closed]:` → `data-open:`/`data-closed:` (tw-animate idiom kept, matching the base-nova golden). Defaults preserved: `align='center'`, `sideOffset=4`; `side='bottom'`, `alignOffset=0` now explicit (same as the old radix defaults).
  - **`PopoverAnchor` export REMOVED** — Base UI has no Anchor part. The equivalent is the `anchor` prop on `PopoverContent` (forwarded to the Positioner; accepts Element / VirtualElement / RefObject). Sole consumer migrated (below). Flagged for fork users: any external code importing `PopoverAnchor` must switch to `anchor=`.
  - PopoverHeader/Title/Description remain plain `div`/`p` elements (they never used radix primitives; Base UI's real Title/Description parts were NOT adopted — legacy rule: their shape stays theirs).
- `src/client/modules/chat/components/ChatFirstRunTour.tsx` — `<PopoverAnchor virtualRef={{ current: anchor }} />` removed; `anchor={anchor}` now passed on PopoverContent. `onOpenAutoFocus={(e) => e.preventDefault()}` → `initialFocus={false}`.
- `PopoverTrigger asChild` → `render={<Button/>}` (children stay on the Trigger) at: `src/components/ui/date-picker.tsx:37` (call-site fix only — date-picker itself is react-day-picker composition), `src/client/modules/connectors/components/ConnectionDetail.tsx:573`, `src/client/modules/skills/components/SkillEditor.tsx:266`, `src/client/modules/routines/components/RoutinePickers.tsx:40,157,258,377`, `src/client/pages/StyleGuidePage.tsx:622,656`.
- `asChild` + plain `<button>` folded into the native-button Trigger at: `src/client/modules/spaces/components/MessageReactions.tsx:97`, `src/client/modules/spaces/components/AttachmentMenu.tsx:101`.
- CSS-var rewrite `w-[var(--radix-popover-trigger-width)]` → `w-[var(--anchor-width)]` at: ConnectionDetail.tsx:585, RoutinePickers.tsx (×4 PopoverContent). Var is set on the Positioner and inherits to the Popup.

Leftover scan clean: `grep -n "radix-ui\|@radix-ui\|PopoverAnchor"` on all files above → no matches; no `PopoverAnchor` usage remains anywhere in src/.

## Left alone

- `src/components/ui/combobox.tsx` — does not use popover.
- `src/client/components/NotificationBell.tsx` — uses dropdown-menu (later batch), not popover.

## Behavior changes

- `onOpenChange` gains `(open, eventDetails)`; consumers use single-arg setters — type-safe.
- Collision defaults shift slightly: Base `collisionPadding` defaults to 5 (radix 0) and `collisionBoundary` to clipping ancestors — popovers may flip/shift ~5px earlier near viewport edges. Flagged, not patched (no consumer set collision props).
- Radix `avoidCollisions`/`sticky`/`hideWhenDetached` no longer exist on the wrapper — no consumer used them.
- `initialFocus={false}` in ChatFirstRunTour matches radix's prevented open-auto-focus (focus stays in the page); popover focus management otherwise moves from radix's event callbacks to Base's declarative props — no other consumer touched them.

## Verify by hand

1. New routine page: all four pickers open; popup width matches the trigger (anchor-width var); search input inside skills/tools pickers focuses and filters.
2. Chat first-run tour (clear `chat-tour-seen` in localStorage, visit /dashboard/chat): popover anchors to the model picker / input / attach button, focus does NOT jump, Next/Back steps re-anchor.
3. Space page: emoji reaction picker and attachment (+) popovers open aligned as before.
4. StyleGuide: date-picker and combobox popovers open with fade/zoom animation and close on outside click / ESC.
