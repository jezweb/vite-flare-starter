# shadcn Textarea/Input — text-xs needs the md: variant to win

## The rule

`src/components/ui/textarea.tsx` and `src/components/ui/input.tsx` both
ship with `text-base md:text-sm` baked into their base class. That means
on desktop (md+) the shadcn defaults want 14px, and any single-breakpoint
override you add fights this:

```tsx
// ❌ text-xs silently loses on desktop — shadcn's md:text-sm wins
<Textarea className="font-mono text-xs" />

// ✅ both breakpoints explicitly 12px
<Textarea className="font-mono text-xs md:text-xs" />

// ✅ or an arbitrary value, which isn't in the type-scale family so
//    doesn't conflict with text-base / md:text-sm at all
<Textarea className="font-mono text-[11px] md:text-[11px]" />
```

## Why this is hidden

Tailwind's `cn()` (via tailwind-merge) dedupes conflicting utilities at
the SAME breakpoint — but `text-xs` and `md:text-sm` are at different
breakpoints, so both survive the merge. On mobile your `text-xs` wins;
on desktop `md:text-sm` wins. Nobody notices because QA happens on
mobile-first or the text is close enough in size to be ignored.

Discovered when the skills source-editor Textarea looked larger than
intended — `text-xs` was being applied but desktop was rendering 14px
monospace. The screen was showing `md:text-sm` the whole time.

## When to apply

Any time you want a Textarea or Input to render denser than 14px on
desktop (code editors, monospace fields, data-entry grids). Add both
variants.

## When NOT to worry

- Fields that should use shadcn's default 14px on desktop, 16px on mobile
  (standard forms, prose inputs) — leave as-is
- Components that are NOT shadcn Input/Textarea (e.g. a plain `<input>`)
  — no base class to fight

**Last Updated**: 2026-04-24
