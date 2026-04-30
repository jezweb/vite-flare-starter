# Layout primitives — plan

**Date**: 2026-04-30
**Status**: Approved by Jez, ready to execute
**Estimated**: ~145 min across 7 independently-committable phases
**Linked issue**: gh #59 ("Replace split-pane entity list pages with reusable EntityListPage")
**Reporter context**: Other Claude Code session building RightCover at `/Users/jez/Documents/rightcover` — same machine, same Jez

---

## TL;DR

Ship **focused layout primitives** (compose from shadcn, build the one missing piece) instead of a kitchen-sink `<EntityListPage>` mega-component proposed in gh #59. Retrofit Skills (the only real split-pane offender), add scaffolds for the cards/table variants, ship a Charts dogfood on Agent Observability, and write a CLAUDE.md decision rule so the next fork-builder picks the right layout on first attempt.

The reporter's diagnosis was right on Skills but oversold the scope (claimed 3 offenders; reality is 1 — Routines is already a list, Connections is already cards). Reject the abstraction, ship the layout-primitives shelf instead.

---

## Why this shape (vs the gh #59 proposal)

The proposed `<EntityListPage<T>>` mega-config component would be a premature framework by the user-global rule `~/.claude/rules/trust-skills-not-elaborate-code.md` ("3+ instances over time, or 'I know we'll add more of these'"). Today: 1 confirmed offender + hypothetical future Contacts/Policies/Deals.

The lean primitives approach:
- Each piece small + focused (one job)
- Pages compose them — readable per-page JSX, no config blobs
- Most primitives come from shadcn (compose, don't reinvent)
- Forks pick the right primitive via the CLAUDE.md decision rule

---

## Layout coverage check (today + future)

| Layout | Status | shadcn primitive | When to use |
|---|---|---|---|
| Card grid | v1 (this plan) | **Item** + grid wrapper | find-and-act, 5–30 visual/logo-y |
| List row | ✓ shipped | `ListRowGroup` | find-and-act/edit, text-heavy |
| Table | v1 (this plan) | **Data Table** (TanStack Table) | structured, sort/filter, 50+ |
| Split-pane | ad-hoc, formalise v1 | **Resizable** | sequential reading (Inbox, Approvals) |
| Kanban | v2 (when first ask) | none — dnd-kit + Card | workflow stages (RightCover renewals likely first ask) |
| Calendar (events) | v2 (when first ask) | shadcn Calendar = date-grid only | date-anchored entities |
| Tree | v3 (real demand only) | none | hierarchies (rare) |
| Gallery | v3 (real demand only) | **Carousel** + Aspect Ratio | image-heavy entities |

---

## Open decisions answered before saving (assumed by default)

1. **Skills detail location**: inline below grid (claude.ai-style), NOT a separate `/skills/:name` route. Matches Connections, no new route needed.
2. **Deploy state**: wrangler auth expired earlier — phases 1, 2, 4, 6, 7 can complete without auth (code + type-check + build only). Phases 3 + 5 ideally verify live; if auth not back, mark as "ready, awaits next-session live verify".
3. **This plan is saved** for cross-session resume.

---

## Phases

### Phase 1 — Install shadcn primitives + audit existing customs (~30m)

**Install** (single CLI run, in order):
```bash
pnpm dlx shadcn@latest add chart data-table item toggle-group empty resizable hover-card combobox pagination progress breadcrumb accordion scroll-area navigation-menu collapsible
```

The first 10 are layout / list / chart primitives.
The last 5 are general-utility primitives that fit a wider range of
forks (wiki-style content pages, FAQ sections, deep-nav surfaces,
mega-menus). All are small + theme-aware; install cost is negligible
and ready-to-use beats reinvent-on-demand.

**Expected installed paths** (verify after):
Layout / list / charts:
- `src/components/ui/chart.tsx`
- `src/components/ui/data-table.tsx` (NB: shadcn ships only the building blocks; the example shows TanStack Table integration)
- `src/components/ui/item.tsx`
- `src/components/ui/toggle-group.tsx`
- `src/components/ui/empty.tsx`
- `src/components/ui/resizable.tsx`
- `src/components/ui/hover-card.tsx`
- `src/components/ui/combobox.tsx` (NB: shadcn's combobox is a recipe combining Command + Popover; may need to assemble)
- `src/components/ui/pagination.tsx`
- `src/components/ui/progress.tsx`

General-utility (wiki-friendly + broadly useful):
- `src/components/ui/breadcrumb.tsx` — already needed in several places (project → chat has a manual chevron breadcrumb today)
- `src/components/ui/accordion.tsx` — settings sections, FAQs, dashboard "What this starter ships with" footer
- `src/components/ui/scroll-area.tsx` — custom-styled scrollbars for sidebars + TOCs
- `src/components/ui/navigation-menu.tsx` — top-level mega-menu surface (forks with a public marketing landing)
- `src/components/ui/collapsible.tsx` — atomic version of Accordion for one-off folds

**Audit each against existing customs**:
- `src/client/components/EmptyState.tsx` vs shadcn `Empty` — keep ours if better (we already pass icon + action + secondaryAction); document why or replace if shadcn wins.
- `src/components/ui/popover.tsx` (current PopoverAnchor work in ChatFirstRunTour) — unchanged.
- Custom `Spinner` — keep (smaller than shadcn variant).

**Verify**: `pnpm type-check` clean. No retrofits in this phase — just install + ensure nothing breaks.

**Commit**: `chore(ui): install shadcn layout primitives + charts (chart, data-table, item, toggle-group, empty, resizable, hover-card, combobox, pagination, progress)`

---

### Phase 2 — Build the one missing primitive (~15m)

**File**: `src/client/lib/use-view-preference.ts`

```ts
/**
 * useViewPreference — persist user's preferred layout view per surface.
 *
 * Scoped to app id + surface key so different list pages don't collide
 * in localStorage. SSR-safe (returns default until first render).
 *
 * Usage:
 *   const [view, setView] = useViewPreference<'cards' | 'list' | 'table'>(
 *     'skills',     // surface key
 *     'cards',      // default
 *   )
 */
import { useEffect, useState } from 'react'
import { appConfig } from '@/shared/config/app'

export function useViewPreference<T extends string>(
  surfaceKey: string,
  defaultView: T,
): [T, (next: T) => void] {
  const storageKey = `${appConfig.id}-view-${surfaceKey}`
  const [view, setView] = useState<T>(defaultView)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) setView(stored as T)
    } catch {
      // localStorage unavailable (private browsing, quota) — use default
    }
  }, [storageKey])

  function update(next: T) {
    setView(next)
    try {
      window.localStorage.setItem(storageKey, next)
    } catch {
      // ignore — view still updates in-memory
    }
  }

  return [view, update]
}
```

**Verify**: `pnpm type-check` clean.

**Commit**: `feat(ui): useViewPreference hook for per-surface layout view persistence`

---

### Phase 3 — Retrofit Skills (~30m)

**Goal**: replace `lg:grid-cols-[320px_1fr]` split-pane with view-toggleable layout. Cards default. List view via toggle. Selected skill detail renders below (scroll-into-view), no separate route.

**File**: `src/client/modules/skills/pages/SkillsPage.tsx`

**Change shape**:
```tsx
const [view, setView] = useViewPreference<'cards' | 'list'>('skills', 'cards')

return (
  <PageContainer type="catalog">
    <PageHeader
      title="Skills"
      subtitle="Teach your AI to do specific jobs..."
      trailing={<>... primary "Add skill" CTA ...</>}
    />

    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">{skills.length} skills</p>
      <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as 'cards' | 'list')}>
        <ToggleGroupItem value="cards"><LayoutGrid className="size-4" /></ToggleGroupItem>
        <ToggleGroupItem value="list"><List className="size-4" /></ToggleGroupItem>
      </ToggleGroup>
    </div>

    {view === 'cards' ? (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {skills.map((s) => (
          <Item asChild key={s.id} variant={effectiveSelected === s.name ? 'outline' : 'default'}>
            <button onClick={() => setSelectedName(s.name)}>
              <ItemMedia><Sparkles className="size-4" /></ItemMedia>
              <ItemContent>
                <ItemTitle>{formatSkillName(s.name)}</ItemTitle>
                <ItemDescription>{s.description}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Badge>{s.source}</Badge>
                <Switch checked={s.enabled} onCheckedChange={...} aria-label={...} />
              </ItemActions>
            </button>
          </Item>
        ))}
      </div>
    ) : (
      <ListRowGroup>{/* existing list-row pattern, unchanged */}</ListRowGroup>
    )}

    {effectiveSelected && (
      <div ref={detailRef} className="mt-6">
        <SkillEditor key={effectiveSelected} name={effectiveSelected} />
      </div>
    )}
  </PageContainer>
)
```

**Behaviour notes**:
- Click a card / list-row → `setSelectedName(s.name)` and scroll the detail section into view.
- Selection visually shown via Item `variant='outline'` or a custom selected-state.
- Switch inside Item is its own focus stop (already de-nested in earlier work — confirm still good).
- Mobile: cards collapse to 1-col, detail renders below — same flow.

**Verify**:
- `pnpm type-check` clean
- `pnpm build` clean
- Live (post-deploy): toggle persists across reloads, selection scrolls into view, no nested-interactive axe violations.

**Commit**: `feat(skills): card-grid layout with list-view toggle (gh #59)`

---

### Phase 4 — Two new `_template` scaffolds (~20m)

**Files**:
- `src/client/modules/_template/pages/CatalogPage.tsx`
- `src/client/modules/_template/pages/TablePage.tsx`

**`CatalogPage.tsx`** — cards-default with optional list toggle:
```tsx
/**
 * TemplateCatalogPage — copy this for a "find-and-act" entity list with
 * 5-30 items where each item has a logo / icon / visual.
 *
 * Use cases: connections, skills, routines, agents, model picker.
 *
 * Default view: cards. Toggle to list available.
 *
 * For a "find-and-edit text-heavy" surface, copy IndexPage.tsx instead
 * (uses ListRowGroup directly with no view toggle).
 *
 * For "structured + sort + 50+ items", copy TablePage.tsx instead.
 */
// ... full implementation: PageContainer + PageHeader + ToggleGroup +
//     Item-grid OR ListRowGroup + Empty state ...
```

**`TablePage.tsx`** — Data Table default:
```tsx
/**
 * TemplateTablePage — copy this for a "structured rows that benefit from
 * sort + filter + pagination" surface.
 *
 * Use cases: contacts (CRM), policies, claims, deals, transactions.
 *
 * Uses shadcn Data Table (TanStack Table). Built-in: column sort,
 * pagination, optional column visibility toggle, optional row selection.
 *
 * For "5-30 items, find-and-act", copy CatalogPage.tsx instead.
 */
// ... full implementation: PageContainer + PageHeader + DataTable
//     with example columns ...
```

**Verify**: copying each scaffold verbatim into a new module + renaming `Things` → `Foos` should compile. (Just type-check after the files land — they reference no real data, so no runtime test needed.)

**Commit**: `feat(_template): CatalogPage + TablePage scaffolds for cards + table variants`

---

### Phase 5 — Charts dogfood on Agent Observability (~25m)

**Step 5.1**: Survey existing Agent Observability data shape:
```bash
grep -rn "agent_runs\|agent-observability\|costUsd\|outcome" src/server/modules/agent-observability/ src/client/modules/agent-observability/ 2>/dev/null | head -30
```

Look for:
- Aggregate-by-agent endpoint (list of agents with run counts / cost)
- Aggregate-by-day endpoint (cost per day for last N days)

**Step 5.2**: If endpoints exist, render charts. If they don't yet, add minimal aggregations:
- `GET /api/agent-observability/stats?range=7d` → `{ runsByAgent: [{ agentClass, count }], costByDay: [{ date, cost }] }`
- Pull from `agent_runs` table — already exists per CLAUDE.md.

**Step 5.3**: Add to top of agent-observability page:
```tsx
<div className="grid gap-4 lg:grid-cols-2">
  <Card>
    <CardHeader><CardTitle>Runs per agent (last 7 days)</CardTitle></CardHeader>
    <CardContent>
      <ChartContainer config={runsConfig}>
        <BarChart data={runsByAgent}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="agentClass" />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="count" fill="var(--color-runs)" radius={4} />
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
  <Card>
    <CardHeader><CardTitle>Cost per day (last 14 days)</CardTitle></CardHeader>
    <CardContent>
      <ChartContainer config={costConfig}>
        <AreaChart data={costByDay}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area dataKey="cost" type="monotone" fill="var(--color-cost)" stroke="var(--color-cost)" />
        </AreaChart>
      </ChartContainer>
    </CardContent>
  </Card>
</div>
```

**Verify**:
- `pnpm type-check` clean
- `pnpm build` clean
- Live: empty data renders sensibly (e.g. "No runs in the last 7 days" empty state) — chart shouldn't crash on empty arrays.

**Commit**: `feat(agent-observability): runs + cost charts via shadcn Chart (Recharts)`

---

### Phase 6 — CLAUDE.md decision rule (~15m)

**Add to `CLAUDE.md`** (after the existing "UI Patterns" section, before deployment):

```markdown
## Choosing a layout for a list page

| Pattern | When | Primitive | Scaffold |
|---|---|---|---|
| **Card grid** | find-and-act, 5–30 visual/logo-y items | shadcn `Item` + Tailwind grid | `_template/CatalogPage.tsx` |
| **ListRow** | find-and-act/edit, text-dominant | `ListRowGroup` (custom) | `_template/IndexPage.tsx` |
| **Table** | structured, sort/filter, 50+ items | shadcn `Data Table` | `_template/TablePage.tsx` |
| **Split-pane** | sequential reading (Inbox, Approvals) | `Resizable` + `ListRow` | none yet — use Inbox as ref |
| **Kanban** (v2) | workflow stages | not yet — extract when 1st use case lands | — |
| **Calendar** (v2) | date-anchored entities | not yet — base on shadcn `Calendar` + custom event renderer | — |

**When to add a new layout primitive**:
- 3+ surfaces in this codebase OR a strong "we're about to build several of these" — only then.
- New primitive should be small + focused (one job) following the existing primitives' shape, NOT a config-blob component.
- Document the use case + when-to-use in this table when it lands.

**For aggregates / trends / dashboards**: shadcn `Chart` (Recharts under the hood, themed via `chart-1..5` CSS vars). Don't import Recharts directly — go through the shadcn wrapper for consistent theming.
```

**Verify**: just a doc edit, no compile.

**Commit**: `docs(claude.md): layout decision rule + when-to-add-a-new-primitive guidance`

---

### Phase 7 — Close gh #59 (~10m)

**Comment** (paste verbatim, fill in the SHA):

```
Resolved differently than proposed — closing with the rationale.

**What shipped** (commit <SHA>):
- shadcn primitives installed (chart, data-table, item, toggle-group, empty,
  resizable, hover-card, combobox, pagination, progress)
- `useViewPreference` hook for per-surface localStorage view persistence
- Skills retrofitted: card-grid default + list-view toggle, no more split-pane
- Two new `_template` scaffolds: `CatalogPage.tsx` (cards) + `TablePage.tsx` (Data Table)
- Charts dogfood on `/dashboard/agent-observability` (runs/agent + cost/day)
- CLAUDE.md decision rule for layout choice + when to add a new primitive

**What we did NOT ship**: the proposed `<EntityListPage<T>>` config-blob
abstraction.

**Why**: the diagnosis on Skills was right (split-pane in a 250px rail with
14 items is genuinely bad), but Routines was already a list-row pattern and
Connections was already cards. So 1 real offender, not 3. By the
`trust-skills-not-elaborate-code.md` rule (3+ instances before extracting
an abstraction), a single-page fix doesn't justify a generic component —
especially one that would over-fit specific behaviours and resist future
shape changes.

The middle ground we shipped — focused primitives + scaffolds + decision
rule — gives forks the same drop-in ergonomics ("which scaffold + which
primitive?") without the kitchen-sink config component. If forks build 3+
similar list pages and pain emerges, happy to revisit and extract.

Thanks for the well-shaped issue — your "find-and-act vs sequential reading"
framing is what's now in the CLAUDE.md decision table.
```

**Close**.

---

## Resume instructions (for a fresh session)

If you're picking this up cold:

1. Read this file end-to-end (5 min).
2. Check what's already done: `git log --oneline | head -20` — look for the phase commit messages above.
3. Check current state of gh #59: `gh issue view 59 --json state,comments`.
4. Pick up at the next un-shipped phase. Each phase is independently committable, so partial progress is fine.

**If wrangler auth is still expired** when you reach phases 3 + 5, ship the code + commit + note "live verification deferred to next session" in the commit body. Don't block.

---

**Last Updated**: 2026-04-30
