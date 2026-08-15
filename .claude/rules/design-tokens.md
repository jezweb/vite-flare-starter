# Design tokens: single-source structure, placeholder values

`src/index.css` is the single source of truth; `src/lib/themes.ts` presets are
demo-only inline overrides on top (deleted at fork, see FORKING.md Part 0). The
tool-agnostic description (Google Labs DESIGN.md format, readable by Cursor/
Copilot/Stitch) lives at the repo root: [`DESIGN.md`](../../DESIGN.md), update
it in the same commit as any token change.

The VALUES in index.css are the placeholder theme (Kumo-derived, 2026-07
reboot). The STRUCTURE is the contract. **Forks: deviation from VALUES is
mandatory; deviation from STRUCTURE is the smell.** A fork extracts the
client's real brand and rewrites every value before building any product
surface (FORKING.md Part 0, DESIGN_BRIEF.md). Per-product semantic scales are
blessed: name new tokens in the product's own language (the brand/brass/clay
pattern) rather than forcing a brand into the placeholder's vocabulary.

## The rules (structure, survives every fork)

- **Semantic tokens only** in app code: `bg-background/card/surface-elevated/
  surface-recessed/surface-tint`, `text-foreground/muted-foreground`,
  `border-border/hairline`, `bg-info-tint` etc. If no token fits, add a token.
- **Never write a `.dark { --token: … }` block or `dark:` color variant for
  theming.** Every token declares both modes via `light-dark()` in `:root`;
  `.dark` only flips `color-scheme`. (`dark:` stays legitimate for rare
  non-color tweaks.)
- **Two border weights**: `border-border` ("line", alpha) for interactive/
  structural edges; `border-hairline` for quiet dividers (sidebar, breadcrumb
  strips, tab bars). Don't invent a third.
- **Density comes from the global text scale** (base 14px / sm 13px / xs 12px
  in `@theme`), don't sprinkle `text-[13px]` to densify; the scale already did
  it. `tabular-nums` on data numbers.
- **Page anatomy** is PageHeader's job (breadcrumbs strip → 3xl title →
  max-w-prose subtitle → tabs). No hand-rolled page headers.

## Kumo interop (charts)

Kumo's Chart/TimeseriesChart DOM needs `kumo-*` utilities: generated via the
`@source` glob in index.css + `--color-kumo-*` vars mapped onto ours. If chart
tooltips lose styling after a Kumo upgrade, the chunk glob is the tell. Canvas
can't read CSS vars, so resolve colors through `useChartTheme`
(`@/client/lib/echarts`).

## Failure mode this prevents

A new module hand-picks hexes/palette classes, adds a `.dark` override block,
and the app drifts back to three sources of truth that disagree in one mode.
The 2026-07 reboot removed exactly that (themes.ts silently overrode index.css
for two months).

**Last Updated**: 2026-08-16
