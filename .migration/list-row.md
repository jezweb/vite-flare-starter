# list-row

2026-07-16, transformation engine (custom in-house wrapper, no registry counterpart), Slot machinery migrated to useRender+mergeProps. Verdict: clean; 3 call sites updated.

## Changed

- `src/components/ui/list-row.tsx` — `ListRow` used the children-as-slot idiom (`Slot.Slot` + `asChild`). Rewired to `useRender` + `mergeProps` with the `render` prop (`useRender.ComponentProps<'div'> & VariantProps`). Dropped `React.forwardRef` (React 19 ref-as-prop flows through `useRender` props; no consumer passed a ref). The `interactive` default now keys on `Boolean(render)` instead of `asChild` — same intent ("row rendered as Link/button is interactive"). Doc comment updated to show the render-prop usage.
- Call sites (children-as-slot -> render, content hoisted from the Link into ListRow children):
  - `src/client/modules/_template/pages/CatalogPage.tsx` — `<ListRow render={<Link to=… />}>`
  - `src/client/modules/_template/pages/IndexPage.tsx` — same
  - `src/client/modules/activity/pages/ActivityPage.tsx` — `<ListRow render={<Link to={href} />}>{inner}</ListRow>`

Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/list-row.tsx` → no matches; `asChild` gone from all three consumer files.

## Left alone

- `ListRowIcon/Body/Title/Meta/Trailing/Group` — plain elements (still forwardRef; harmless, no radix).

## Behavior changes

None intended. The rendered DOM for `render={<Link/>}` is a single `<a>` carrying the row classes and the slot children — identical to the old Slot output.

## Verify by hand

- Activity page rows with a target deep-link render as `<a data-slot="list-row">` and navigate on click; keyboard focus shows the ring (interactive variant).
- Template Index/Catalog list views: hover tint + trailing chevron color shift still work (`group-hover/list-row` keys on the row element's class, which survives the merge).
