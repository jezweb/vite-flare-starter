---
version: 1
name: Vite Flare Starter
description: Cloudflare-Kumo-derived design language — calm, dense, blue-primary
colors:
  primary: "oklch(57.72% 0.2324 260)" # blue — actions, links, focus-adjacent
  primary-hover: "oklch(48.8% 0.243 264.376)"
  background-light: "oklch(98.75% 0 0)"
  background-dark: "oklch(10% 0 0)"
  foreground-light: "oklch(21% 0.006 285.885)"
  foreground-dark: "oklch(97% 0 0)"
  destructive: "oklch(57.7% 0.245 27.325)"
  brand-accent: "orange" # Cloudflare orange — logo/brand moments ONLY, never actions
typography:
  font-family: "Inter, system-ui, sans-serif"
  base-size: "14px"
  scale: { xs: "12px", sm: "13px", base: "14px" }
  numerals: "tabular-nums on data"
rounded:
  default: "0.375rem"
spacing:
  page-padding: "p-4 md:p-6"
components:
  library: "shadcn/ui on Base UI (base-nova), Phosphor icons, Kumo ECharts"
---

# Vite Flare Starter — Design

> **This is the placeholder language, superseded by
> [`DESIGN_BRIEF.md`](./DESIGN_BRIEF.md) at fork.** It stays the
> reference for the starter's default look; a fork extracts the client's
> real brand and rewrites the token values (FORKING.md Part 0), keeping
> the structure this file describes. Canonical source: `src/index.css`.
> Every token there declares both light and dark values via
> `light-dark()`; when this file and the CSS disagree, the CSS wins.
> Update this file in the same commit as a token change.

## Overview (Brand & Style)

Cloudflare-Kumo-derived (2026-07 reboot): a calm, dense, professional
dashboard language. Information-first — hierarchy comes from spacing and
the type scale, not from decoration. Blue means "you can act on this";
orange is reserved for brand moments (logo, wordmark) and never signals
an action. Placeholder text is dimmed to 25% opacity.

## Colors

Use **semantic tokens only** in app code: `bg-background`, `bg-card`,
`bg-surface-elevated` / `-recessed` / `-tint`, `text-foreground`,
`text-muted-foreground`, `bg-info-tint` and friends. Raw palette classes
(`bg-blue-500`, `text-gray-900`) are a smell — if no token fits, add a
token to `src/index.css`.

- {colors.primary} is the single action colour (buttons, links, active
  states). Hover: {colors.primary-hover}.
- Status tints (info/success/warning/danger) have dedicated `-tint`
  surface tokens for callouts and banners.
- Charts resolve `--chart-1..5` through `useChartTheme`
  (`@/client/lib/echarts`) — canvas can't read CSS variables.

**Dark mode is not a stylesheet.** Every token self-declares both modes
with `light-dark()`; `.dark` only flips `color-scheme`. Never write a
`.dark { --token: … }` block or a `dark:` colour variant.

## Typography

{typography.font-family} at a **14px base** ({typography.scale.sm} for
secondary, {typography.scale.xs} for captions). Density comes from this
global scale — don't sprinkle `text-[13px]` to densify; the scale
already did it. Data numbers get `tabular-nums`.

## Layout & Spacing

Pages compose the `AppShell` primitive (`src/components/ui/app-shell.tsx`)
and open with `PageHeader` (breadcrumb strip → 3xl title → max-w-prose
subtitle → tabs). Content padding is {spacing.page-padding}. List pages
pick a shape from the layout table in `CLAUDE.md` (card grid / list row /
table / split-pane / kanban).

## Elevation

Flat by default. Elevation is expressed through the surface ladder
(`surface-recessed` → `background` → `card` → `surface-elevated`) plus a
hairline border, not through heavy shadows. `shadow-sm` on interactive
cards, `shadow-lg` only on overlays (popovers, drag ghosts).

## Shapes

{rounded.default} radius everywhere (`rounded-md`). Pills for badges and
counts. **Two border weights only**: `border-border` (alpha "line") for
interactive/structural edges, `border-hairline` for quiet dividers —
don't invent a third.

## Components

{components.library}. Base UI composition uses the `render` prop (never
`asChild`). Icons are Phosphor — match the muted-foreground colour at
rest. Custom primitives live in `src/components/ui/` (Banner, Meter,
ClipboardText, KanbanBoard, AppShell, PageHeader) — check there before
building new chrome.

Analytics surfaces compose the CF-dashboard kit rather than raw cards:
`DashboardPanel` (titled shell, recessed header strip, actions slot) +
`StatGrid`/`StatCard` (KPI with delta chip + sparkline strip) +
`BreakdownList` (top-N proportional bars) + `SegmentedBar`/`SeriesLegend`
(whole-composition splits) + `TimeRangePicker` (preset ranges) +
`RadialGauge` (quota circles) + `LogTail` (event streams) + `Sparkline`
(inline SVG, `currentColor`, never ECharts). ECharts stays reserved for
real time-axis charts on lazy routes. Worked example:
`/dashboard/analytics-demo`.

## Do's and Don'ts

- **Do** use semantic tokens; **don't** hardcode hexes or palette classes.
- **Do** declare both modes via `light-dark()` in `:root`; **don't** add
  `.dark` overrides or `dark:` colour variants.
- **Do** keep orange for brand accents; **don't** use it for buttons,
  links, or status.
- **Do** rely on the 14px type scale for density; **don't** shrink text
  per-component.
- **Do** use `PageHeader` for page anatomy; **don't** hand-roll titles.
- **Do** resolve chart colours through `useChartTheme`; **don't** pass
  CSS variables to canvas.
