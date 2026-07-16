# aspect-ratio

2026-07-16, transformation engine (legacy style `new-york`, classification only; file matched golden apart from formatting). Verdict: radix AspectRatio replaced by a plain div + CSS `aspect-ratio` (`--ratio` var), per the no-counterpart hard rule.

## Changed

- `src/components/ui/aspect-ratio.tsx` — `AspectRatio as AspectRatioPrimitive` from `radix-ui` removed. Renders `<div data-slot="aspect-ratio" style={{'--ratio': ratio}} className="aspect-(--ratio)">`; `ratio` prop (default `1`) preserved so call sites keep the same API. `'use client'` dropped.

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/aspect-ratio.tsx` → no matches.

## Left alone

- No consumers exist in the app (swept: only the wrapper references AspectRatio), so nothing else changed.

## Behavior changes

- Radix absolutely-positioned the child inside a padding-hack wrapper, so any child auto-filled the box. The CSS version requires media children to size themselves (`w-full h-full object-cover`). No current call sites are affected (there are none); noted for future use in a code comment.

## Verify by hand

1. (No live usage.) Drop `<AspectRatio ratio={16/9}><img className="h-full w-full object-cover" …/></AspectRatio>` into a page: box holds 16:9 at any width.
