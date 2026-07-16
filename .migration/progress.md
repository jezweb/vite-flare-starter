# progress

2026-07-16, transformation engine (legacy style `new-york`, classification only; file differed from golden in formatting only). Verdict: restructured to Base UI's Root > Track > Indicator anatomy; manual fill transform deleted.

## Changed

- `src/components/ui/progress.tsx` — import swapped to `@base-ui/react/progress`. New required `ProgressPrimitive.Track` inserted (`data-slot="progress-track"`); the bar's visual classes (`relative h-2 w-full overflow-hidden rounded-full bg-primary/20` + merged consumer `className`) moved onto Track, which is the bar element in Base UI (Root is a plain wrapper div). The radix fill idiom `style={{ transform: translateX(-(100 - value)%) }}` on the Indicator is deleted — the Base primitive computes the fill width itself via inline style. Indicator classes kept minus `w-full flex-1` (dead: the primitive's inline `width` overrides them; noted here per honest-reporting).

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/progress.tsx` → no matches.

## Left alone

- Sole consumer `src/client/pages/ComponentsPage.tsx:373` (`<Progress value={66} className="w-full max-w-sm" />`) — className now lands on Track; layout result is identical (Root is a block wrapper). No `getValueLabel`/`data-state` usage anywhere.

## Behavior changes

- Indeterminate state hooks renamed: radix `data-state="indeterminate"` → Base `data-indeterminate` (no classes referenced either; nothing to rewrite).
- Fill animation: width transition (via existing `transition-all`) instead of transform translate — visually equivalent, no longer GPU-transform-based.

## Verify by hand

1. Components page → Progress card: bar renders at 66% width, rounded, correct colours.
2. Temporarily change the value in devtools React props: fill animates smoothly.
