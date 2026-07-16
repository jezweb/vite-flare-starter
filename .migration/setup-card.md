# setup-card

2026-07-16, transformation engine (custom in-house wrapper, no registry counterpart), Slot machinery migrated to useRender+mergeProps. Verdict: clean; migration also fixes a latent Slot bug.

## Changed

- `src/components/ui/setup-card.tsx` — `SetupCard` used `Slot.Slot` + `asChild`. Rewired to `useRender` + `mergeProps` with the `render` prop. The card's internal layout (icon block, title/description, chevron, badge slot) is built as `content` and passed as `children` through mergeProps, so `render={<Link to=… />}` produces a single Link element carrying the full card layout. `asChild && 'cursor-pointer'` and the chevron/badge conditionals now key on `render`.
- Public API change: `asChild` -> `render`. Grep found **zero** consumers in src/ (pattern-library component); no call-site fixes.

Leftover scan: `grep -n "radix-ui\|@radix-ui\|asChild" src/components/ui/setup-card.tsx` → no matches.

## Left alone

- `SetupCardList` — plain div.

## Behavior changes

- **Latent bug fixed, flagged for awareness:** the old `asChild` path could never have worked — Radix `Slot` requires exactly one element child, but SetupCard always rendered 2+ internal children (icon block + body), so any `asChild` use would have thrown `React.Children.only` at runtime (and the consumer's Link element was dropped from `children` entirely, never rendered). No consumer existed, so nothing observable changes; the `render` path is the first working as-link mode for this component.

## Verify by hand

- Dashboard "Get set up" panel (when wired): default/active/completed states render with unchanged tints; completed shows green check + strikethrough.
- `<SetupCard render={<Link to="/x" />} icon={Mail} title="Connect Gmail" />` navigates on click and shows the chevron nudge on hover.
