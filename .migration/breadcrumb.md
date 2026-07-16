# breadcrumb

2026-07-16, transformation engine (legacy new-york style — classes kept verbatim), Slot machinery migrated to useRender+mergeProps. Verdict: clean.

## Changed

- `src/components/ui/breadcrumb.tsx` — `BreadcrumbLink` was the only radix-dependent part (`Slot.Root` + `asChild`). Rewired to `useRender` + `mergeProps` from `@base-ui/react` with the `render` prop (`useRender.ComponentProps<'a'>`), per the universal-patterns worked example. Object literal with `data-slot` cast `as React.ComponentProps<'a'>` (mergeProps excess-property pitfall). All other parts (Breadcrumb, List, Item, Page, Separator, Ellipsis) are plain elements — untouched.
- Public API change: `asChild` prop removed in favour of `render`. Grep of `src/` found **zero** consumers of `BreadcrumbLink` (component is a pattern-library reference); no call-site fixes needed.

Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/breadcrumb.tsx` → no matches.

## Left alone

- All non-Slot parts of breadcrumb.tsx — plain HTML elements, no radix involvement.

## Behavior changes

None. `useRender` with a `render` element is prop-merge-equivalent to the Slot idiom for this component.

## Verify by hand

- Render a `<BreadcrumbLink render={<Link to="/x" />}>Label</BreadcrumbLink>` — the anchor should be a single react-router Link carrying `data-slot="breadcrumb-link"` and the hover color transition.
- Plain `<BreadcrumbLink href="/x">` still renders a native `<a>`.
