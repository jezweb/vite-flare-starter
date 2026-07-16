# scroll-area

2026-07-16, transformation engine (legacy style `new-york`, classification only; file CUSTOMIZED vs golden — viewport focus-ring classes). Verdict: part renames + new Content wrapper; radix hover show/hide restated as data-hovering/data-scrolling transitions.

## Changed

- `src/components/ui/scroll-area.tsx` —
  - Import swapped to `@base-ui/react/scroll-area`; `ScrollAreaScrollbar` → `Scrollbar`, `ScrollAreaThumb` → `Thumb` (renames), `Root`/`Viewport`/`Corner` unchanged.
  - New `ScrollAreaPrimitive.Content` (`data-slot="scroll-area-content"`) wraps children inside the Viewport — Base needs it for horizontal overflow measurement, and its built-in `min-width: fit-content` replaces radix's internal `display:table` wrapper div (verified in `ScrollAreaContent.js`).
  - Scrollbar visibility: radix's default `type="hover"` (mount on hover/scroll, hide after 600ms) has no Base prop; restated per the reference as CSS — `opacity-0 delay-[600ms] data-hovering:opacity-100 data-scrolling:opacity-100` (+ instant show, 600ms-delayed fade). Existing size/border classes unchanged.
- `src/index.css` — comment-only fix: the thin-scrollbar note referenced `data-radix-scroll-area-viewport`; now describes Base UI's injected scrollbar-hiding class (Base's viewport does hide native scrollbars, so the global `*::-webkit-scrollbar` styling still doesn't double up).

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/scroll-area.tsx` → no matches.

## Left alone

- Consumers: `NotificationBell.tsx`, `ai-elements/suggestion.tsx` (horizontal ScrollBar — served by the new Content part), `StyleGuidePage.tsx`. None pass the dropped radix `type`/`scrollHideDelay` props; no call-site changes.

## Behavior changes

- Scrollbar show/hide is now CSS transitions on a mounted element instead of radix mount/unmount; timing tuned to match (show on hover/scroll, fade 600ms after). Keyboard-initiated scrolls also set `data-scrolling`, so behavior is equivalent or slightly better.
- `data-state="visible|hidden"` styling hooks no longer exist (unused here).

## Verify by hand

1. Notification bell dropdown with many notifications: scrollbar appears while scrolling/hovering, fades ~0.6s after you stop.
2. Chat suggestions row (horizontal): drag/scroll sideways; content overflows properly (Content part working); hidden ScrollBar stays hidden (`className="hidden"`).
3. StyleGuide ScrollArea demo: vertical + horizontal bars behave; corner renders where both meet.
