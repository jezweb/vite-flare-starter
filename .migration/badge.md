# badge

2026-07-16, transformation engine (legacy style `new-york`, classification only; file CUSTOMIZED vs golden — extra `ghost`/`link` variants, `data-variant` attr). Verdict: Slot/asChild idiom replaced with `useRender` + `mergeProps` (non-button polymorphic pattern).

## Changed

- `src/components/ui/badge.tsx` — `Slot` from `radix-ui` removed. `asChild?: boolean` prop replaced by `render` via `useRender` from `@base-ui/react/use-render` + `mergeProps` from `@base-ui/react/merge-props`, per the skill's worked example (badge is a non-button polymorphic component, so it does NOT use the Button primitive). Object literal with `data-*` keys cast `as React.ComponentProps<'span'>` (mergeProps excess-property pitfall). cva class string unchanged, including the `[a&]:hover:*` anchor-variant selectors, which keep working when `render={<a/>}` is used.

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/badge.tsx` → no matches.

## Left alone

- All consumers — swept `grep -rn "<Badge[^>]*asChild"`: zero `asChild` call sites existed, so no consumer edits.

## Behavior changes

- None. Default rendering is still a `<span>` with identical attributes; polymorphism now goes through `render` instead of `asChild`.

## Verify by hand

1. Any list page with status badges (Skills, Routines, Inbox): badges render identically (size, colour, radius).
2. StyleGuide badge section: all variants render; no console warnings.
