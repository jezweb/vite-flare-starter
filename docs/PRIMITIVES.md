# UI Primitives

The components a page is allowed to compose from. The grammar in
`docs/PAGE_GRAMMAR.md` references this file by name — adding a new
top-level pattern starts with adding a primitive here.

## Decision tree: which primitive renders this list?

```
Is it a list of items the user scans top-to-bottom?
├── Yes — a queue of decisions, findings, runs, files, etc.
│   └── Use ListRowGroup + ListRow                      ← Inbox / Activity / Notifications / Routines
│       Scaffold: _template/IndexPage.tsx
│
├── Yes — find-and-act, 5–30 visual/logo-y items
│   └── Use Item + Tailwind grid                         ← Projects / Spaces / Skills / Connections
│       Scaffold: _template/CatalogPage.tsx
│
├── Yes — structured uniform rows, sort/filter/pagination, 50+
│   └── Use DataTable (shadcn + TanStack Table)          ← Admin Users / Contacts / Policies
│       Scaffold: _template/TablePage.tsx
│
├── Yes — a key/value pair display (technical detail)
│   └── Use KeyValueRow + KeyValueList inside HelpDisclosure
│
└── No — it's a single-record dwell view (one project, one routine)
    └── Use Section blocks                                ← Project detail / Routine detail / Conversation
```

**Need a view toggle on the same surface** (cards ⇄ list, table ⇄ cards)?
Use `useViewPreference('<surface-key>', '<default>')` from
`@/client/lib/use-view-preference`. Persists per-user via localStorage
scoped to `appConfig.id` so forks don't collide. See `SkillsPage` for a
worked example.

**For trends / dashboards / charts**: shadcn `Chart` (Recharts under the
hood, themed via `--chart-1..5` CSS vars). See `AgentObservabilityPage`
for a worked example with bar + area charts side-by-side.

## Page-level primitives (mandatory)

| Primitive | File | Use |
|---|---|---|
| **PageContainer** | `components/ui/page-container.tsx` | Outer wrapper. Picks max-width by `type`. |
| **PageHeader** | `components/ui/page-header.tsx` | H1 + subtitle + trailing CTA. Sets document.title. |
| **StatGrid + StatCard** | `components/ui/stat-grid.tsx` | Stat row, ≤4 items, even widths. |
| **PageFilters + PageFilterTabs + PageFilterChip** | `components/ui/page-filters.tsx` | Tabs + chips between header and body. |
| **PageEmpty / PageError / PageLoading** | `client/components/PageState.tsx` | The three async-state wrappers. |

## Row + section primitives

| Primitive | File | Use |
|---|---|---|
| **ListRow + ListRowGroup** | `components/ui/list-row.tsx` | Queue rows. Supports unread/urgent/disabled states. |
| **Item + ItemMedia/Content/Title/Description/Actions** | `components/ui/item.tsx` | Card-grid rows with icon + body + actions. Use inside a Tailwind grid (`grid gap-3 sm:grid-cols-2 xl:grid-cols-3`). |
| **Section** | `components/ui/section.tsx` | Grouped block with uppercase or headline title. |
| **Card** | `components/ui/card.tsx` | Dwell surfaces with multi-line content. NOT for queue rows. |
| **Table** | `components/ui/table.tsx` | Low-level tabular markup. Wrap in `DataTable` for sort/pagination. |
| **DataTable** | `components/ui/data-table.tsx` | Generic shadcn + TanStack Table integration. Sort, pagination, empty state, optional row click. Pass `columns: ColumnDef<T>[]` + `data: T[]`. |

## Detail / disclosure primitives

| Primitive | File | Use |
|---|---|---|
| **HelpDisclosure** | `components/ui/help-disclosure.tsx` | Wraps `<details>` for technical / advanced detail. |
| **KeyValueRow + KeyValueList** | `components/ui/key-value-row.tsx` | Inside HelpDisclosure for ID / slug / payload display. |

## Specialised primitives

| Primitive | File | Use |
|---|---|---|
| **SetupCard + SetupCardList** | `components/ui/setup-card.tsx` | First-run checklist (Dashboard hub). |
| **CapabilityChip + CapabilityRow** | `components/ui/capability-chip.tsx` | "Gmail connected · 22 skills" inline summary. |
| **StatusPill** | `components/ui/status-pill.tsx` | Status badges (Connected, Pending, Failed, Disabled). Replaces hand-rolled `<Badge variant="outline" className="text-[10px] …">` patterns and private `StatusBadge` functions. Maps `kind` to `STATUS_SOFT_BG` tokens. |
| **IdentityRow** | `components/ui/identity-row.tsx` | Avatar + name + secondary line (email or role) + optional rightSlot. Standardises initials calculation — replaces 4 hand-rolled `Avatar` blocks each with their own buggy initials logic (one was rendering `userId.slice(0,2)`). |
| **CopyButton** | `components/ui/copy-button.tsx` | "Copy this value" button with auto Copy/Check icon flip + standard toast. Replaces 12 hand-rolled `navigator.clipboard.writeText` blocks with 7 different toast strings. |
| **SearchInput** | `components/ui/search-input.tsx` | Icon-in-input search with optional clear button. Replaces 9 hand-rolled `<Search className="absolute left-3 …">` recipes with drift in icon size + padding. |
| **Time** | `components/ui/time.tsx` | `<time>` element with relative/short/absolute display + tooltip. Pairs with `shared/format/datetime.ts` helpers. |
| **Spinner** | `components/ui/spinner.tsx` | Loading indicator. Sizes: xs (size-3) / sm (size-3.5, default) / md (size-4) / lg (size-5). Replaces hand-rolled `<Loader2 className="animate-spin" />`. |
| **EmptyState** | `client/components/EmptyState.tsx` | Wired by PageEmpty/PageError. Has `tips` + dual-action API. |
| **ConfigDiffCard** | `client/components/ConfigDiffCard.tsx` | Approval card with line diff. |
| **ToggleGroup + ToggleGroupItem** | `components/ui/toggle-group.tsx` | Single/multi-select pill row. Use for view toggles (cards ⇄ list), date-range pickers (7d/14d/30d), filter sets. |
| **Chart + ChartContainer + ChartTooltip + ChartTooltipContent + ChartLegend** | `components/ui/chart.tsx` | Wraps Recharts with theme-token resolution (`--chart-1..5`). Don't import Recharts directly. |
| **Empty + EmptyHeader + EmptyMedia + EmptyTitle + EmptyDescription + EmptyContent** | `components/ui/empty.tsx` | Low-level shadcn empty-state composables. Use `EmptyState` (canonical, has `tips` + actions) for normal cases; reach for these only when you need finer control. |
| **Resizable** | `components/ui/resizable.tsx` | Drag-handle split panes. Use for sequential-reading surfaces (Inbox, Approvals). |
| **HoverCard** | `components/ui/hover-card.tsx` | Hover-triggered popover for richer-than-Tooltip preview content. **Worked example**: `ProjectHoverCard` in chat sidebar's project bucket headers. |
| **ContextMenu** | `components/ui/context-menu.tsx` | Right-click menu for power-user shortcuts on rows. Additive — use alongside an existing kebab/click target, never replace it. **Worked example**: InboxRow with Mark read / Archive / Copy ID / Open in approvals. |
| **Combobox** | `components/ui/combobox.tsx` | Searchable single-select. Built on Command + Popover. |
| **InputOTP** | `components/ui/input-otp.tsx` | 4–6 digit verification code field (segmented). Reach for this on 2FA setup, magic-link verify, sensitive action confirmation. *Currently no consumer — installed for future 2FA / API-token-rotation flows.* |
| **AspectRatio** | `components/ui/aspect-ratio.tsx` | Fixed-ratio container (16/9, 1/1, 4/3) — use for image/video thumbnails where you need a known canvas size before media loads. *Currently no consumer — reach for this on entity cover images, video thumbs, embedded maps.* |
| **Carousel** | `components/ui/carousel.tsx` | Swipeable / paged horizontal content. Reach for this on image galleries, multi-photo entity views, onboarding tour cards. *Currently no consumer — first product needing image-rich entities will surface this.* |
| **Slider** | `components/ui/slider.tsx` | Continuous range input. Reach for this on settings (temperature, max-tokens, theme adjust), filters (price, date range). *Currently no consumer — keep installed for forks; a number input is fine for one-off cases.* |
| **Pagination** | `components/ui/pagination.tsx` | Numbered page links + prev/next chevrons. Already used inside `DataTable`. |
| **Progress** | `components/ui/progress.tsx` | Linear progress bar. |
| **Breadcrumb** | `components/ui/breadcrumb.tsx` | Multi-level navigation trail (project → conversation → message). |
| **Accordion** | `components/ui/accordion.tsx` | Vertically-stacked collapsible sections. Multiple-open or single-open via `type`. |
| **Collapsible** | `components/ui/collapsible.tsx` | Atomic single-item fold (lighter than Accordion). |
| **ScrollArea** | `components/ui/scroll-area.tsx` | Custom-styled scrollbars for sidebars / TOCs. |
| **NavigationMenu** | `components/ui/navigation-menu.tsx` | Top-level mega-menu surface (forks with a public marketing landing). |

## Helper modules (non-component)

| Module | File | Use |
|---|---|---|
| **datetime helpers** | `shared/format/datetime.ts` | `formatRelative` / `formatShort` / `formatAbsolute` / `formatDuration` / `parseTimestamp`. Single source of truth for date/time formatting. |
| **useCopy hook** | `client/lib/use-copy.ts` | Hook for clipboard copy with standardised success/error toasts. |
| **useViewPreference hook** | `client/lib/use-view-preference.ts` | Persist a per-surface layout view (`'cards' \| 'list'` etc.) in localStorage scoped to `appConfig.id + surfaceKey`. SSR-safe; tolerates quota / private-browsing failures. |
| **toast helpers** | `client/lib/toast-helpers.ts` | `toastSavedX` / `toastDeletedX` / `toastCreatedX` / `toastFailedTo` for verb-tense-consistent toast messages. |
| **status colour tokens** | `client/lib/status-colors.ts` | `STATUS_SOFT_BG` / `STATUS_TEXT` / `STATUS_SOLID` for traffic-light hues. Use via `StatusPill` first; raw tokens only for one-offs that don't fit the badge shape. |

## Builder mode

| Primitive | File | Use |
|---|---|---|
| **BuilderModeProvider** | `client/lib/builder-mode.tsx` | Mounted at app root. |
| **useBuilderMode()** | `client/lib/builder-mode.tsx` | Read isBuilder + toggle in components / nav config. |

## Anti-primitives — DO NOT use

| Anti-pattern | Why it's banned | Use instead |
|---|---|---|
| Hand-rolled `document.title = …` | Duplicates PageHeader; breaks if you forget | `<PageHeader title="…" />` (or `<DetailHeader>` for detail pages) |
| Hand-rolled `<div className="container mx-auto max-w-…"` | Picks an arbitrary width; drift | `<PageContainer type="…" />` |
| Hand-rolled stat row | Three different shapes today | `<StatGrid items={…} />` |
| Hand-rolled `<details>` / "Show more" toggles | Style drift | `<HelpDisclosure>` |
| `<Loader2 className="animate-spin" />` in JSX | Hand-rolled drift across 6 sizes | `<Spinner size="sm\|md\|lg" />` |
| Hand-rolled status badge (`<Badge variant="outline" className="text-[10px] …">Connected</Badge>`) | Two private impls + 20 inline variations | `<StatusPill kind="success" label="Connected" />` |
| Hand-rolled avatar+name block with bespoke initials logic | 4 variations, one renders `userId.slice(0,2)` (garbage) | `<IdentityRow name=… secondary=… imageUrl=… />` |
| `navigator.clipboard.writeText` + toast inline | 12 sites, 7 different toast strings | `<CopyButton value=… />` or `useCopy()` hook |
| Hand-rolled icon-in-input search bar | 9 sites with drift on icon size + padding | `<SearchInput value=… onChange=… />` |
| `formatDistanceToNow(date)` / inline `toLocaleDateString` | No source of truth, 13+ ad-hoc imports | `formatRelative` / `formatShort` / `formatAbsolute` from `@/shared/format/datetime` (or `<Time value=…>`) |
| Bare `<Loader2 className="animate-spin" />` filling the body | Doesn't match loaded shape | `<PageLoading variant="list" />` |
| Inline raw `bg-amber-500/10 text-amber-700 dark:text-amber-400` | `STATUS_SOFT_BG` token map exists | `STATUS_SOFT_BG.warning` or `<StatusPill kind="warning" />` |
| Hand-rolled `className="h-7 px-2 text-xs"` button | Drift; xs size already exists on Button | `<Button size="xs">` |
| `toast.success('X saved.')` / `toast.error('Failed to save X. Please try again.')` | Verb-tense + period drift across 30+ sites | `toastSavedX('X')` / `toastFailedTo('save X', err)` from `toast-helpers.ts` |
| Hand-rolled detail-page header (back-link + h1 + actions) | Drift across detail pages | `<DetailHeader>` |
| Hand-rolled form section (h2 + description + field group) on `form`-type pages | Settings tabs drifted before this primitive landed | `<FormSection>` with `density="comfortable"` (Card-wrapped) or `compact` (no Card) |
| Importing `recharts` directly | Skips theme-token resolution; charts won't follow `--chart-1..5` and won't rebrand cleanly | Wrap in `<ChartContainer config={…}>` from `@/components/ui/chart` |
| Hand-rolled `<button>` + Switch nested in a single clickable card | nested-interactive a11y violation; breaks keyboard focus order | Use `Item` with the title-button as a flex child and Switch in `ItemActions` (sibling) — two clean focus stops. See `SkillsPage` worked example. |
| Hand-rolled `localStorage.getItem('view-…')` for view toggles | Drift on storage-key prefix; not SSR-safe; collides across forks | `useViewPreference('<surface>', '<default>')` from `@/client/lib/use-view-preference` |
| `<EntityListPage<T> config={…} />` mega-component | Premature framework — extracts the same bug across 3 pages | Compose the primitive matching the shape (Item / ListRow / DataTable) per page; only extract a generic when 3+ surfaces prove it |
| Per-page `space-y-{5\|7\|8}` | Off-ladder | `space-y-{1,2,3,4,6}` only |
| `text-3xl` / `text-4xl` for page H1 | Off-scale; shouts louder than the contract | `text-2xl font-semibold tracking-tight` (PageHeader / DetailHeader) |
| Adding a 7th page type to PageContainer | Categorisation war | `maxWidth` override prop |
| Building a custom `<details>` with bespoke styling | Drift | `<HelpDisclosure>` |
| Inline `agentClass` / `kind` / `slug` in user copy | Vocabulary leak | `formatAgentClass` / `formatKind` / `formatTrigger` from `@/shared/format/agent` |
| `cn('text-sm text-muted-foreground …')` for a section description | Hand-rolled drift | `<Section description="…">` or `<FormSection description="…">` |
| `<CapabilityChip asChild><Link …/></CapabilityChip>` (or any chip with internal layout + asChild) | Radix Slot expects a single child element; the chip's dot+icon+label spans break it. Throws "React.Children.only expected to receive a single React element child." | Wrap from outside: `<Link><CapabilityChip … /></Link>`. Same applies to other primitives that compose internal layout. |

## Verification grep recipes

Run these periodically to catch drift before it spreads:

```bash
# Pages NOT using PageContainer (should be small + each one documented)
grep -L "PageContainer" src/client/modules/*/pages/*.tsx src/client/pages/*.tsx

# Hand-rolled document.title sets (should be zero outside layout + PageHeader/DetailHeader)
grep -rn "document.title =" src/client/

# Off-scale spacing
grep -rn "space-y-[578]\|gap-[579]" src/client/

# Off-scale H1 sizes
grep -rn "text-3xl\|text-4xl" src/client/modules/

# Raw agent class names in JSX (likely a vocabulary leak)
grep -rn "memory_extraction\|inter_agent" src/client/modules/ | grep -v "format/agent"

# Hand-rolled spinners (mechanical sweep target — replace with <Spinner size=…>)
grep -rn "Loader2 .* animate-spin" src/client/modules/ | wc -l

# Hand-rolled status badges (replace with <StatusPill>)
grep -rn 'variant="outline".*text-\[10px\]' src/client/modules/

# Hand-rolled clipboard writes (replace with <CopyButton> or useCopy())
grep -rn "navigator.clipboard.writeText" src/client/

# Hand-rolled icon-in-input search bars (replace with <SearchInput>)
grep -rln "absolute left-3.*translate-y" src/client/modules/

# Direct date-fns formatDistanceToNow imports (prefer shared/format/datetime + <Time>)
grep -rln "from 'date-fns'" src/client/modules/

# Hand-rolled h-7 buttons (use <Button size="xs">)
grep -rn 'className="[^"]*h-7' src/client/modules/

# Inline status colours that should use STATUS_SOFT_BG / StatusPill
grep -rn "bg-amber-500/10\|bg-red-500/10\|bg-green-500/10\|bg-emerald-500/10" src/client/modules/
```

## Adding a new primitive

When a new pattern shows up in 3+ pages:

1. Add it to `components/ui/` (or `client/components/` if it's app-specific).
2. Document its shape + decision-tree fit here.
3. Update `docs/PAGE_GRAMMAR.md` if it's page-level.
4. If it replaces a hand-rolled pattern, list the replacement under
   "Anti-primitives" above and grep for the old pattern.

## Last updated

2026-04-30 — Layout-primitives ship (gh #59):
- 14 shadcn primitives installed (chart, data-table, item, toggle-group,
  empty, resizable, hover-card, combobox, pagination, progress,
  breadcrumb, accordion, scroll-area, navigation-menu, collapsible).
- New `DataTable` integration over TanStack Table.
- New `useViewPreference` hook for per-surface layout view persistence.
- Decision tree updated to point at the matching `_template/` scaffold
  per shape (queue → IndexPage, cards → CatalogPage, table → TablePage).
- Orphan `components/ui/empty-state.tsx` removed; canonical empty-state
  is `client/components/EmptyState.tsx` (the shadcn `Empty` family stays
  as low-level composables for special cases).

2026-04-29 — Phase 0 of design-coherence work added PageHeader,
PageContainer, StatGrid, PageFilters, KeyValueRow + KeyValueList,
HelpDisclosure, SetupCard, CapabilityChip, BuilderModeProvider,
PageState wrappers.
