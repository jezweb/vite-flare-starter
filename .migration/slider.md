# slider

2026-07-16, transformation engine (legacy style `new-york`, classification only; file differed from golden in formatting only). Verdict: restructured to Base UI's Root > Control > Track > (Indicator, Thumb) anatomy; two controlled consumers re-typed.

## Changed

- `src/components/ui/slider.tsx` —
  - Import swapped to `@base-ui/react/slider`. New required `SliderPrimitive.Control` part inserted (the pointer surface; radix Root handled pointer events itself) carrying the interactive layout classes; Root keeps the original class string (incl. merged consumer `className`), with `data-[disabled]:opacity-50` rewritten to `data-disabled:opacity-50` (presence attr, unchanged semantics).
  - `Range` → `Indicator` (rename; `data-slot="slider-range"` kept for any external selectors).
  - Thumbs moved inside `Track` (Base anatomy) and each gets `index={index}`.
  - `thumbAlignment="edge"` set on Root to preserve radix's thumb-inside-track geometry (Base defaults to `center`).
  - Thumb class rewrites for the element change (Base Thumb is a `<div>` wrapping a hidden `<input type="range">`, focus lands on the input): `focus-visible:ring-4` → `has-[input:focus-visible]:ring-4`, `disabled:pointer-events-none disabled:opacity-50` → `data-disabled:*`. `hover:ring-4` unchanged.
- Consumer fixes (`onValueChange` value widened to `number | readonly number[]` in Base):
  - `src/client/pages/ComponentsPage.tsx:272` — `onValueChange={setSliderValue}` → wrapped setter normalising to `number[]`.
  - `src/client/pages/StyleGuidePage.tsx:590` — same fix.

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/slider.tsx` → no matches.

## Left alone

- `_values` default `[min, max]` (two thumbs when uncontrolled with no defaultValue) — kept as-is; it's the project's own convention.
- No `onValueCommit` (would rename to `onValueCommitted`) or `inverted` usage anywhere.

## Behavior changes

- `onValueChange` now fires with `(value, eventDetails)` and, for range sliders, thumb collisions default to `push` in Base (radix behaved like `none`). Single-thumb consumers unaffected.
- Keyboard focus ring: previously `:focus-visible` on the thumb element; now driven via `has-[input:focus-visible]` because focus sits on the nested input. Same visual, different mechanism — check it renders.
- Radix `onValueCommit` no longer exists; any future consumer must use `onValueCommitted` (none today).

## Verify by hand

1. Components page slider: drag the thumb — value label updates live; thumb stays within the track at 0 and 100.
2. Keyboard: Tab to the thumb — ring-4 focus ring appears; arrow keys move by step, PageUp/Down by 10.
3. StyleGuide disabled slider: dimmed, non-interactive.
