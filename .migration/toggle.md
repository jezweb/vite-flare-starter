# toggle

2026-07-16, transformation engine (legacy style `new-york`, classification only; file CUSTOMIZED vs golden — formatting-level drift). Verdict: swapped to the callable Base UI Toggle; pressed-state classes carry a transitional dual hook.

## Changed

- `src/components/ui/toggle.tsx` — `Toggle as TogglePrimitive` now from `@base-ui/react/toggle`; radix `TogglePrimitive.Root` → callable `TogglePrimitive` (Base renders a native `<button>`, so the `disabled:*` variants stay live). Class-mapping rename applied: `data-[state=on]:bg-accent data-[state=on]:text-accent-foreground` → `data-pressed:*` — BUT the radix selectors are intentionally kept alongside (see below).

Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/toggle.tsx` → no import matches; the string `data-[state=on]:` remains in the cva by design (transitional, documented in a code comment).

## Left alone

- `src/components/ui/toggle-group.tsx` — still radix (later batch). It imports `toggleVariants` for its items, which is exactly why the cva keeps BOTH `data-pressed:` (Base Toggle) and `data-[state=on]:` (radix ToggleGroup.Item) pressed hooks. ToggleGroup is live in 6 files (chart-area-interactive, CatalogPage, AgentObservabilityPage, KnowledgePage, SkillsPage, StyleGuidePage) — stripping the radix selector now would visually break their pressed state mid-migration. **The toggle-group batch must delete the `data-[state=on]:*` classes here when it lands.**
- Standalone Toggle consumers (StyleGuidePage) — no `asChild`, no `onPressedChange` handlers using a second arg; no call-site changes needed.

## Behavior changes

- `onPressedChange` now receives `(pressed, eventDetails)`; existing single-arg handlers remain type-safe. No consumers currently pass handlers that used radix event data.

## Verify by hand

1. StyleGuide → Toggle section: click each toggle — pressed state shows the accent background; disabled toggle is inert and dimmed.
2. Skills page view toggle (ToggleGroup, still radix): pressed segment still highlights — confirms the transitional dual-hook works.
