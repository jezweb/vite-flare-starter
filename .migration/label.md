# label

2026-07-16, transformation engine (legacy style `new-york`, classification only; file CUSTOMIZED vs golden — `group-data-[disabled=true]` form-context variants). Verdict: radix `Label.Root` replaced with a native `<label>` per the no-counterpart rule.

## Changed

- `src/components/ui/label.tsx` — `Label as LabelPrimitive` from `radix-ui` removed; renders a native `<label>` (Base UI has no standalone Label; `Field.Label` only works inside `Field.Root`). Props type is now `React.ComponentProps<'label'>` (`htmlFor` etc. unchanged). Radix's only behavioral extra (no text selection on double click) was already covered by the existing `select-none` class. Added `peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-50` alongside the existing `peer-disabled:*` variants — Base UI checkbox/switch/radio roots render `<span>`s exposing disabled state as `data-disabled`, so the pseudo-class-only variants would silently stop firing for those peers (class-mapping "element changes kill pseudo-class variants" rule; the radix variants stay for native input peers). `'use client'` directive dropped (no client-only primitive left; Vite SPA ignores it anyway).

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/label.tsx` → no matches.

## Left alone

- `src/components/ui/form.tsx` FormLabel (wraps this Label) — still works unchanged; form.tsx is a later batch.
- All `<Label htmlFor=...>` consumers — native label keeps the same API; no call-site changes needed (no `asChild` usages existed).

## Behavior changes

- None functional. The rendered element no longer carries radix's `onMouseDown` double-click-selection guard; `select-none` covers the same UX via CSS.

## Verify by hand

1. Settings → Profile: click a field label — focus moves to its input (htmlFor association intact).
2. Double-click a label — text does not get selected.
3. A disabled Switch/Checkbox with a peer label (e.g. Preferences) still dims its label once those components are on Base UI.
