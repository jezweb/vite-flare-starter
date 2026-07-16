# direction

2026-07-16, transformation engine (CUSTOM component, not a shadcn registry file — no golden exists; it wraps the radix Direction utility with a dual `dir`/`direction` API). Verdict: rewired to Base UI's Direction Provider; public API unchanged.

## Changed

- `src/components/ui/direction.tsx` — `Direction` from `radix-ui` replaced with `DirectionProvider` + `useDirection` from `@base-ui/react/direction-provider`. Base's prop is `direction` (not `dir`, per the hard rule); the wrapper already accepted both spellings and still does (`direction ?? dir`). `useDirection` re-export now comes from Base UI (returns `'ltr' | 'rtl'`, same shape radix returned).

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/direction.tsx` → no matches.

## Left alone

- No consumers exist (`DirectionProvider`/`useDirection` referenced only in this wrapper).

## Behavior changes

- Radix's provider only fed radix components; Base UI's only feeds Base UI components. During the transition window, a `DirectionProvider` would direct migrated (Base) components but not the remaining radix ones. Irrelevant today — zero consumers — but worth knowing mid-migration.

## Verify by hand

1. (No live usage.) Wrap a page in `<DirectionProvider direction="rtl">` with a migrated component (e.g. Slider) — arrow-key/RTL layout behavior reverses.
