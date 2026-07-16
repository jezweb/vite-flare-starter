# radio-group

2026-07-16, transformation engine (legacy style `new-york`, classification only). Verdict: group stays one callable primitive, items move to the `Radio` namespace; zero consumer edits.

## Changed

- `src/components/ui/radio-group.tsx` — imports split per Base UI: group from `@base-ui/react/radio-group` (callable, no `.Root`), items from `@base-ui/react/radio` (`Radio.Root` + `Radio.Indicator`).
  - `RadioGroupItem`: `disabled:cursor-not-allowed disabled:opacity-50` → `data-disabled:*` (Base UI `Radio.Root` renders a `<span>` + hidden `<input>`, so `:disabled` pseudo-class variants are dead code). All other classes kept verbatim.
  - Verified in `RadioRoot.js`: the `id` prop is forwarded to the hidden `<input>` (labelable element), so the existing `<Label htmlFor="r1">` + `<RadioGroupItem id="r1">` pairs in both consumers keep native label-click association (radix rendered a `<button>`, also labelable — behavior preserved).

Consumer sweep: StyleGuidePage.tsx and ComponentsPage.tsx (only consumers) — both use `value={string} onValueChange={setState}`; Base UI `Value = any` keeps `Dispatch<SetStateAction<string>>` assignable, and the new second `eventDetails` arg is optional for single-arg handlers. No `orientation`, `loop`, `dir`, or `asChild` usage. Zero call-site edits.

Leftover scan: `grep -n "radix-ui\|@radix-ui"` clean on radio-group.tsx.

## Left alone

- `native-select.tsx`, `combobox.tsx` — unrelated primitives despite similar names.

## Behavior changes

- Rendered item element: `<button role="radio">` → `<span role="radio">` + hidden input. Any future `peer-disabled:` styling keyed on the item won't fire; use `data-disabled`.
- Radix `orientation`/`loop` props are gone — arrow-key navigation now handles both axes automatically and always wraps. Not used here.
- `onValueChange` gains `(value, eventDetails)`; `reason` is `'none'`.

## Verify by hand

1. StyleGuide → Radio Group card: click each option — dot indicator moves, "Currently selected" code label updates.
2. Click the text LABEL (not the circle) — selection must still change (hidden-input association).
3. Keyboard: Tab into the group, ArrowDown/ArrowUp cycles options and wraps; focus ring visible.
