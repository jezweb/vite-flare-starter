# Design tokens — Kumo-derived, single-source

The design language is Cloudflare-Kumo-derived (2026-07 reboot). `src/index.css` is the
single source of truth; `src/lib/themes.ts` presets are deliberate inline overrides on top.
The tool-agnostic description (Google Labs DESIGN.md format, readable by Cursor/Copilot/
Stitch) lives at the repo root: [`DESIGN.md`](../../DESIGN.md) — update it in the same
commit as any token change.

## The rules

- **Semantic tokens only** in app code: `bg-background/card/surface-elevated/surface-recessed/
  surface-tint`, `text-foreground/muted-foreground`, `border-border/hairline`, `bg-info-tint`
  etc. Raw palette classes (`bg-blue-500`, `text-gray-900`) are a smell — if no token fits,
  add a token.
- **Never write a `.dark { --token: … }` block or `dark:` color variant for theming.** Every
  token declares both modes via `light-dark()` in `:root`; `.dark` only flips `color-scheme`.
  (`dark:` stays legitimate for rare non-color tweaks.)
- **Two border weights**: `border-border` ("line", alpha) for interactive/structural edges;
  `border-hairline` for quiet dividers (sidebar, breadcrumb strips, tab bars). Don't invent a
  third.
- **Primary is blue, orange is brand-accent only** (CF convention). Focus ring is neutral.
- **Density comes from the global text scale** (base 14px / sm 13px / xs 12px in `@theme`)
  — don't sprinkle `text-[13px]` to densify; the scale already did it. `tabular-nums` on
  data numbers.
- **Page anatomy** is PageHeader's job (breadcrumbs strip → 3xl title → max-w-prose subtitle
  → tabs). No hand-rolled page headers.

## Kumo interop (charts)

Kumo's Chart/TimeseriesChart DOM needs `kumo-*` utilities: generated via the `@source` glob in
index.css + `--color-kumo-*` vars mapped onto ours. If chart tooltips lose styling after a
Kumo upgrade, the chunk glob is the tell. Canvas can't read CSS vars — resolve colors through
`useChartTheme` (`@/client/lib/echarts`).

## Failure mode this prevents

A new module hand-picks hexes/palette classes, adds a `.dark` override block, and the app
drifts back to three sources of truth that disagree in one mode. The 2026-07 reboot removed
exactly that (themes.ts silently overrode index.css for two months).

**Last Updated**: 2026-07-16
