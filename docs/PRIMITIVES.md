# UI Primitives

The components a page is allowed to compose from. The grammar in
`docs/PAGE_GRAMMAR.md` references this file by name — adding a new
top-level pattern starts with adding a primitive here.

## Decision tree: which primitive renders this list?

```
Is it a list of items the user scans top-to-bottom?
├── Yes — a queue of decisions, findings, runs, files, etc.
│   └── Use ListRowGroup + ListRow                      ← Inbox / Activity / Notifications / Routines
│
├── Yes — a marketplace/dwell surface (cards, multi-line, multi-CTA)
│   └── Use a Card grid                                  ← Projects / Spaces / Skills / Connections
│
├── Yes — tabular data (sortable, paginated, multi-column)
│   └── Use Table                                        ← Admin Users / Files (advanced)
│
├── Yes — a key/value pair display (technical detail)
│   └── Use KeyValueRow + KeyValueList inside HelpDisclosure
│
└── No — it's a single-record dwell view (one project, one routine)
    └── Use Section blocks                                ← Project detail / Routine detail / Conversation
```

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
| **Section** | `components/ui/section.tsx` | Grouped block with uppercase or headline title. |
| **Card** | `components/ui/card.tsx` | Dwell surfaces with multi-line content. NOT for queue rows. |
| **Table** | `components/ui/table.tsx` | Tabular data only. |

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
| **EmptyState** | `client/components/EmptyState.tsx` | Wired by PageEmpty/PageError. |
| **ConfigDiffCard** | `client/components/ConfigDiffCard.tsx` | Approval card with line diff. |

## Helper modules (non-component)

| Module | File | Use |
|---|---|---|
| **datetime helpers** | `shared/format/datetime.ts` | `formatRelative` / `formatShort` / `formatAbsolute` / `formatDuration` / `parseTimestamp`. Single source of truth for date/time formatting. |
| **useCopy hook** | `client/lib/use-copy.ts` | Hook for clipboard copy with standardised success/error toasts. |
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
| Two `<EmptyState>` impls (`components/ui/empty-state.tsx` + `client/components/EmptyState.tsx`) | Pick one; the client one is canonical (has `tips`) | `<EmptyState>` from `@/client/components/EmptyState` |
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

2026-04-29 — Phase 0 of design-coherence work added PageHeader,
PageContainer, StatGrid, PageFilters, KeyValueRow + KeyValueList,
HelpDisclosure, SetupCard, CapabilityChip, BuilderModeProvider,
PageState wrappers.
