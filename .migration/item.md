# item

2026-07-16, transformation engine (legacy new-york style — classes kept verbatim), Slot machinery migrated to useRender+mergeProps. Verdict: clean.

## Changed

- `src/components/ui/item.tsx` — `Item` was the only radix-dependent part (`Slot.Root` + `asChild`). Rewired to `useRender` + `mergeProps` with the `render` prop (`useRender.ComponentProps<'div'> & VariantProps<typeof itemVariants>`). `data-slot`/`data-variant`/`data-size` attributes preserved (the group-has selectors in ItemMedia/ItemContent key on them).
- Public API change: `asChild` prop removed in favour of `render`. Consumers (`CatalogPage`, `AgentsPage`, `KnowledgePage`, `SkillsPage`) use `Item` without `asChild` — unaffected.

Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/item.tsx` → no matches.

## Left alone

- `ItemGroup`, `ItemMedia`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions`, `ItemHeader`, `ItemFooter` — plain elements. `ItemSeparator` composes the already-migrated Separator wrapper.

## Behavior changes

None.

## Verify by hand

- Card-grid pages (Skills, Agents, Knowledge, template Catalog) render Items with unchanged spacing/variants.
- `<Item render={<a href/>}>` gets the `[a]:hover:bg-accent/50` hover treatment (the `[a]` selector now matches because the rendered element is an anchor).
