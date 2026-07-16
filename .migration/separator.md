# separator

2026-07-16, transformation engine (legacy style `new-york`, classification only; file differed from golden only in formatting/`decorative` default). Verdict: clean 1:1 swap to the callable Base UI Separator.

## Changed

- `src/components/ui/separator.tsx` — `Separator as SeparatorPrimitive` now imported from `@base-ui/react/separator`; `SeparatorPrimitive.Root` → callable `SeparatorPrimitive`. `decorative` prop dropped (no Base UI equivalent — Base separators are always semantic `role="separator"`). Classes unchanged; `data-[orientation=...]` selectors are identical on both sides.

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/separator.tsx` → no matches.

## Left alone

- All consumers — none passed `decorative` (swept `grep -rn "decorative" src/`, zero call sites outside the wrapper), none used `asChild`.

## Behavior changes

- Separators previously rendered with `decorative={true}` (radix default in this wrapper) emitted `role="none"`; Base UI always emits `role="separator"` (+ `aria-orientation` for vertical). Screen readers now announce these rules as separators. Flagged, not patched — this is idiomatic Base UI.

## Verify by hand

1. Dashboard/settings pages: horizontal separators still render 1px full-width; sidebar/toolbar vertical separators still full-height 1px.
2. Inspect a separator in devtools: `role="separator"` present, orientation data attribute correct.
