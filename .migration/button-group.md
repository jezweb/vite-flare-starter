# button-group

2026-07-16, transformation engine (legacy new-york style — classes kept verbatim), Slot machinery migrated to useRender+mergeProps. Verdict: clean.

## Changed

- `src/components/ui/button-group.tsx` — `ButtonGroupText` was the only radix-dependent part (`Slot.Root` + `asChild`). Rewired to `useRender` + `mergeProps` with the `render` prop (`useRender.ComponentProps<'div'>`). Added explicit `import * as React` (needed for the mergeProps literal cast).
- Public API change: `asChild` prop removed in favour of `render`. Only consumer is `MessageBranchPage` (`src/components/ai-elements/message.tsx:267`) which passes className/children only — unaffected.

Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/button-group.tsx` → no matches.

## Left alone

- `ButtonGroup` (plain div) and `ButtonGroupSeparator` (composes the already-migrated Base UI Separator wrapper) — no radix involvement.

## Behavior changes

None.

## Verify by hand

- A `ButtonGroup` with buttons + a `ButtonGroupText` renders with fused borders (first/last rounding) exactly as before.
- `<ButtonGroupText render={<label />}>` renders a label carrying the muted text styling.
