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
| **EmptyState** | `client/components/EmptyState.tsx` | Wired by PageEmpty/PageError. |
| **ConfigDiffCard** | `client/components/ConfigDiffCard.tsx` | Approval card with line diff. |

## Builder mode

| Primitive | File | Use |
|---|---|---|
| **BuilderModeProvider** | `client/lib/builder-mode.tsx` | Mounted at app root. |
| **useBuilderMode()** | `client/lib/builder-mode.tsx` | Read isBuilder + toggle in components / nav config. |

## Anti-primitives — DO NOT use

| Anti-pattern | Why it's banned | Use instead |
|---|---|---|
| Hand-rolled `document.title = …` | Duplicates PageHeader; breaks if you forget | `<PageHeader title="…" />` |
| Hand-rolled `<div className="container mx-auto max-w-…"` | Picks an arbitrary width; drift | `<PageContainer type="…" />` |
| Hand-rolled stat row | Three different shapes today | `<StatGrid items={…} />` |
| Hand-rolled `<details>` / "Show more" toggles | Style drift | `<HelpDisclosure>` |
| Bare `<Loader2 className="animate-spin" />` in a body | Doesn't match loaded shape | `<PageLoading variant="list" />` |
| Two `<EmptyState>` impls (`components/ui/empty-state.tsx` + `client/components/EmptyState.tsx`) | Pick one; the client one is canonical (has `tips`) | `<EmptyState>` from `@/client/components/EmptyState` |
| Per-page `space-y-{5\|7\|8}` | Off-ladder | `space-y-{1,2,3,4,6}` only |

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
