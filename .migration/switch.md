# switch

2026-07-16, transformation engine (legacy style `new-york`, classification only; file CUSTOMIZED vs golden — `size` variant via `data-size` + group classes). Verdict: 1:1 part mapping with class-attribute renames.

## Changed

- `src/components/ui/switch.tsx` — import swapped to `@base-ui/react/switch` (`Root`/`Thumb` unchanged). Class-mapping rewrites: `data-[state=checked]:` → `data-checked:`, `data-[state=unchecked]:` → `data-unchecked:` (root and thumb, incl. `dark:` variants), and `disabled:cursor-not-allowed disabled:opacity-50` → `data-disabled:*` (Base root renders a `<span>` + hidden `<input>`; `:disabled` variants are dead). The custom `data-size` / `group/switch` sizing system is untouched (it's this project's own attribute, not a radix one).

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/switch.tsx` → no matches.

## Left alone

- All 13 consumer files — handlers are `onCheckedChange={(checked: boolean) => ...}` / setState refs, type-safe against Base's `(checked, eventDetails)` signature. No `asChild`/`value` quirks in use.

## Behavior changes

- Rendered element is now `<span role="switch">` + always-present hidden `<input>` (radix rendered `<button>`). Sibling `peer-disabled:` styling keyed on the switch no longer fires — migrated `label.tsx` carries `peer-data-disabled:*` equivalents.
- Thumb translate still uses `calc(100%-2px)` on `data-checked` — same geometry, verified selector renames on both parts.

## Verify by hand

1. Settings → Preferences: toggle switches — thumb slides fully, track colour flips, state persists.
2. Both sizes (default + `size="sm"` if used) render correct dimensions; keyboard Space toggles; focus ring visible.
3. A disabled switch is dimmed with not-allowed cursor.
