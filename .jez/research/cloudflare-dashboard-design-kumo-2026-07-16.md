---
date: 2026-07-16
status: active
owner: jez+claude
topic: Cloudflare dashboard design language — should the starter reboot away from stock shadcn?
---

# Cloudflare dashboard design research — Kumo + nav philosophy

Context: Jez finds stock shadcn defaults plain, keeps needing custom components, pondering a full
design reboot with the Cloudflare dashboard as the reference. Researched 2026-07-16 (web agents;
live logged-in dashboard walkabout still pending — Chrome extension wasn't connecting).

## Headline: Kumo is public

Cloudflare open-sourced its current dashboard component library **Kumo** (`@cloudflare/kumo`),
Oct 2025, MIT, actively maintained (v2.8.0 on 2026-07-13).

- Repo: https://github.com/cloudflare/kumo · Docs: https://kumo-ui.com
- Stack: **Base UI** (not Radix) + Tailwind v4 + React + **Phosphor Icons**. ESM-only.
- Ships shadcn-style installable **blocks**: `page-header`, `resource-list`, `delete-resource`.
- Has an AI-facing component registry (`npx @cloudflare/kumo ls` / `doc Button`, AGENTS.md).
- Figma plugin for token sync. `data-theme="fedramp"` alternate theme (compliance theming is first-class).
- Caveat: no public post literally says "dash.cloudflare.com = Kumo"; strong inference from repo
  contents (cloudflare-logo component, dashboard-chrome screenshot, fedramp theme).

## Token architecture (the real lesson)

- **Semantic tokens only, lint-enforced** — `bg-kumo-base`, `text-kumo-subtle`,
  `border-kumo-line`, `ring-kumo-hairline`. Raw palette classes (`bg-blue-500`) fail lint.
- **Dark mode via CSS `light-dark()`** — `dark:` variant is banned; tokens auto-adapt.
  Mode set by `data-mode` on a parent. Successor to their 2021 "reverse the luminosity ramp"
  system (https://blog.cloudflare.com/dark-mode/).
- **Explicit surface hierarchy**: canvas (page, oklch ~98.75% light / 10% dark) → base (card) →
  elevated / recessed / tint / overlay / control / fill.
- **Two border weights**: `line` (≈10%-alpha black) vs `hairline`.
- Text ramp: default / strong / subtle / inactive / placeholder / inverse — near-zero chroma grays.
- **Primary/brand is BLUE** (oklch 0.5772 0.2324 260); **Cloudflare orange is text/logo accent
  only**. Do not make orange the button colour when emulating CF.
- Badges: muted "subtle" pairs (800-weight text on 100/200 fills, inverted in dark).

## Typography + density

- **Inter** (verified on docs site; library leaves font-family to the consuming app).
- Denser than stock shadcn: 13px data text in pickers, `tabular-nums` for data, `text-sm` defaults.
- PageHeader h1: `font-heading text-3xl font-semibold`; description `text-base text-kumo-subtle max-w-prose`.

## Page anatomy (from the `page-header` block)

Bordered breadcrumb bar → 3xl semibold title → muted one-line description (max-w-prose, docs link) →
optional tabs → content. Resource pages = header + resource-list; delete flows standardised as a block.
(The starter's PageHeader/ListRow independently converged on this.)

## Nav philosophy (2025-26 redesign posts)

- **Task-named nav, not product-named** ("Traffic policies" not "Gateway") —
  https://developers.cloudflare.com/changelog/new-cloudflare-one-navigation-and-product-experience/
- Analytics consolidated under one **Insights** section; settings co-located with features;
  sub-resources demoted to tabs.
- Account/tenant switcher at top of sidebar; quick-links section (community/docs/support) —
  https://blog.cloudflare.com/zero-trust-navigation/ (principles: consistency, interconnectivity, discoverability).
- Scale tools: command palette (Kumo ships one), favourites/starring, migration-aware search
  (finds pages by old AND new names), replayable guided tour on first login.
- App Security redesign organised by use case: Overview (daily starting point) → Analytics →
  assets → unified rules → settings; "always-on detections" decouple seeing signals from deploying
  rules — https://blog.cloudflare.com/new-application-security-experience/
- Feb 2026: AI got its own top-level sidebar section. Apr 2026: "Agent Lee" — AI-agent interface
  to the whole dashboard.
- Public criticism of the OLD dashboard (dev.to, Jan 2025): "spinner soup", products placed
  sporadically — the redesign was the reaction. Lesson: skeletons-per-module + task naming.

## Recommendation (agreed direction TBD with Jez)

**Re-skin + adopt the token architecture; do NOT reboot the component library.**

The starter is only "stock shadcn" at the skin level — src/components/ui has 77 components of which
~15 are app-primitives we invented (PageHeader, ListRow, StatGrid, StatusPill, DetailHeader, Section,
FormSection, SetupCard, AppShell). The theme, however, is the literal shadcn factory default: old blue
HSL palette, 0.5rem radius, **no typeface** (system stack). What makes CF/Linear/Vercel feel designed:

1. A real typeface (Inter) — single highest-leverage change.
2. Disciplined neutral surface/border tokens (canvas/base/elevated + line/hairline, oklch, low chroma).
3. Density pass (13px data text, tabular-nums, tighter paddings on tables/lists).
4. One standardised page anatomy (already have it).

Migrating 77 Radix components to Base UI = big churn, little visible gain. Kumo is worth pilfering
for: token names/values, the light-dark() approach, page-header/resource-list block anatomy,
empty-state patterns, and Phosphor icons if we want a different icon voice than Lucide.
