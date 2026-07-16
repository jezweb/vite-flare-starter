# hover-card

2026-07-16, transformation engine (legacy style `new-york`, classification only — file differed from golden in formatting only, but the batch keeps our classes regardless). Verdict: primitive renamed HoverCard → PreviewCard (public wrapper names stay HoverCard*); Content → Portal>Positioner>Popup; delays relocated Root → Trigger in 2 consumers.

## Changed

- `src/components/ui/hover-card.tsx` — import `HoverCard as HoverCardPrimitive` from `radix-ui` → `PreviewCard as HoverCardPrimitive` from `@base-ui/react/preview-card`. `HoverCardContent` rebuilt on Portal > Positioner > Popup; `align`/`alignOffset`/`side`/`sideOffset` Picked from Positioner.Props, destructured and forwarded (positioner FORWARD rule). Positioner: `className="isolate z-50"`, no data-slot. Popup keeps our exact classes with rewrites: `origin-(--radix-hover-card-content-transform-origin)` → `origin-(--transform-origin)`, `data-[state=open/closed]:` → `data-open:`/`data-closed:`. Defaults preserved: `align='center'`, `sideOffset=4`.
- `src/client/modules/projects/components/ProjectHoverCard.tsx` — `openDelay`/`closeDelay` moved from `<HoverCard>` (Root) to `<HoverCardTrigger delay closeDelay>` per consumer-props.md (public ProjectHoverCard API unchanged: still `openDelay`/`closeDelay`, defaults 300/100). `HoverCardTrigger asChild>{children}` → `render={children}`; `children` prop narrowed `ReactNode` → `ReactElement` (render requires an element; the only caller passes a `<Link>`).
- `src/components/ai-elements/prompt-input.tsx` — `PromptInputHoverCard` no longer takes `openDelay`/`closeDelay` (they don't exist on Base Root); the 0/0 instant-open defaults moved to `PromptInputHoverCardTrigger` as `delay`/`closeDelay`. No external callers of either exist yet, so no call-site fallout.

Leftover scan clean: `grep -n "radix-ui\|@radix-ui"` on all three files → no matches.

## Left alone

- No other HoverCard consumers exist.

## Behavior changes

- **Open/close timing defaults**: radix Root defaults were openDelay 700 / closeDelay 300; Base Trigger defaults are delay 600 / closeDelay 300. Both our consumers pass explicit values (300/100 and 0/0) so nothing changes in this app, but fork code using bare `<HoverCard>` + `<HoverCardTrigger>` shifts 700→600ms open feel. Flagged, not patched.
- Base UI Trigger renders an `<a>` element when not using `render` (radix also rendered `<a>` — parity); both our consumers use `render`, so their own elements render.
- Collision defaults shift as with popover (collisionPadding 0 → 5). Flagged, not patched.
- `onOpenChange` gains `(open, eventDetails)` — no consumer uses it.

## Verify by hand

1. Chat sidebar → hover a project name: card opens after ~300ms to the right, aligned start, with fade/zoom; moving pointer off closes after ~100ms.
2. Keyboard: focus the project link — preview opens on focus (trigger-focus reason), ESC closes.
