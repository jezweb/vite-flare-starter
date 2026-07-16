# tooltip

2026-07-16, transformation engine (legacy style `new-york`, classification only — file is CUSTOMIZED: `delayDuration = 0` default). Verdict: Content → Portal>Positioner>Popup, Provider `delayDuration`→`delay`, arrow gains per-side positioning classes; 6 consumer files fixed.

## Changed

- `src/components/ui/tooltip.tsx` — import `radix-ui` → `@base-ui/react/tooltip`.
  - `TooltipProvider`: `delayDuration = 0` → `delay = 0` (instant-open default preserved).
  - `TooltipContent`: rebuilt on Portal > Positioner > Popup; `align`/`alignOffset`/`side`/`sideOffset` Picked from Positioner.Props, destructured and forwarded (positioner FORWARD rule). Positioner `className="isolate z-50"`. Popup keeps our exact classes with rewrites: `origin-(--radix-tooltip-content-transform-origin)` → `origin-(--transform-origin)`; the previously ungated enter classes `animate-in fade-in-0 zoom-in-95` are now gated `data-open:` and exit rekeyed `data-[state=closed]:` → `data-closed:` (same idiom as the base-nova golden; ungated animate-in would re-fire oddly while Base UI holds the popup mounted through exit). **`sideOffset` default kept at 0** (our radix wrapper's value; the base registry default is 4 — kept ours per legacy rule).
  - Arrow: our rotated-square arrow (`size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground`) kept, plus per-side positioning classes from the base-nova golden (`data-[side=bottom]:top-1`, `data-[side=left/right]:top-1/2! -right-1/-left-1 -translate-y-1/2`, `data-[side=top]:-bottom-2.5`) — Base UI's Arrow renders a `<div>` and does not auto-rotate/position per side the way radix's svg arrow did. `fill-foreground` is now inert (no svg) but kept for class parity.
- `TooltipProvider delayDuration` → `delay` at: `src/client/App.tsx:241` (200ms), `src/components/ui/sidebar.tsx:123` (0ms — pure call-site fix; sidebar itself is a later batch).
- `TooltipTrigger asChild>{button}` → `render={button}` at: `src/components/ui/sidebar.tsx:521` (call-site only), `src/components/ai-elements/message.tsx:88`, `src/components/ai-elements/prompt-input.tsx:1065`.
- `TooltipTrigger asChild` → `render={<Button/>}` at: `src/client/modules/chat/components/VoiceModeButton.tsx:186` (icon child kept as trigger children), `src/client/pages/ComponentsPage.tsx:479`.

Leftover scan: `grep -n "radix-ui\|@radix-ui"` clean on tooltip.tsx, App.tsx, message.tsx, prompt-input.tsx, VoiceModeButton.tsx, ComponentsPage.tsx. `sidebar.tsx:6` still imports `Slot` from radix-ui — sidebar's own asChild machinery, later batch, intentionally untouched. No `delayDuration`/`skipDelayDuration`/`disableHoverableContent` usage remains anywhere in src/.

## Left alone

- `src/components/ui/sidebar.tsx` beyond the two call-site fixes above (later batch). Its `TooltipContent hidden={...}` prop passes through to the Popup as a plain DOM attribute — still hides the rail tooltips when the sidebar is expanded.

## Behavior changes

- **Delay architecture** (flag, not patched): radix had Provider `delayDuration` + `skipDelayDuration` (300); Base has Provider `delay`/`timeout` (400) + per-Trigger `delay` (600)/`closeDelay` (0). Both app Providers set explicit delays (0 and 200) so open feel is preserved, but the skip-delay "move between tooltips instantly" window changes 300ms → 400ms (Base `timeout` default). No consumer set `skipDelayDuration`.
- Radix `disableHoverableContent` has no Provider equivalent (per-Root `disableHoverablePopup` exists) — unused here.
- Tooltip opens on trigger focus in both libraries; Base adds `closeOnClick` (default true) which matches radix's close-on-activate feel.
- Arrow rendering: `<div>` instead of `<svg>`; per-side placement now via our classes rather than radix's automatic rotation. Left/right-side tooltips are the ones to eyeball (the old wrapper only ever tuned the top-side offset).
- `onOpenChange` gains `(open, eventDetails)` — no consumer uses it.

## Verify by hand

1. Hover chat message action buttons (copy/regenerate): tooltip appears instantly (delay 0 Provider in message.tsx), square arrow points at the button, fade/zoom plays on open and close.
2. Collapse the sidebar: rail icons show right-side tooltips with the arrow correctly on the left edge (per-side arrow classes); expand the sidebar and confirm tooltips are hidden.
3. VoiceModeButton (chat input): tooltip shows on hover AND the press-and-hold recording interaction still works (onPointerDown/Up/Cancel now merged through the render Button).
4. Move quickly between two adjacent tooltipped buttons: second tooltip opens instantly (timeout window).
