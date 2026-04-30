# Page Grammar

The contract every dashboard page must satisfy. Locked down so the app
feels coherent across 30+ surfaces without each page reinventing its own
header, density, or rhythm.

> **One-sentence rule:** Every page renders `PageHeader → PageStats? →
> PageFilters? → PageBody → PageFooter?`, picks one of six page **types**,
> and uses the type's container width + spacing rhythm.

---

## Required structure

```
<PageContainer type="…">         ← sets max-width per type
  <PageHeader title="…" />       ← sets document.title; one CTA + ≤1 secondary
  [<StatGrid items={…} />]       ← optional stats row, ≤4 items
  [<PageFilters>…</PageFilters>] ← optional tabs + chips
  [body]                          ← list / grid / form / detail / catalog
  [<PageFooter>…</PageFooter>]   ← optional sticky bottom (mass-actions)
</PageContainer>
```

**No page is allowed to:**
- Set `document.title` directly (PageHeader does it)
- Hand-roll its own H1 + subtitle layout (PageHeader does it)
- Pick its own container width (PageContainer does it)
- Mix Card chrome with ListRowGroup (use one or the other; pick by type)

---

## The six page types

| Type | Use when | Container | Body shape |
|---|---|---|---|
| **queue** | User triages items: Inbox, Notifications-style streams, Approvals, Activity, Routines list, Files list | `max-w-3xl` | `ListRowGroup` (no Card chrome around rows) |
| **index** | Dwell surfaces: Projects, Spaces, Skills | `max-w-5xl` | `Item` grid 2–3 wide (or `DataTable` for 50+ rows) |
| **detail** | Single-record dwell: project page, routine detail, conversation | `max-w-5xl` to `max-w-7xl` | DetailHeader + body (4 sub-patterns — see below) |
| **form** | Create/edit: New Routine, Settings tabs, Admin tabs | `max-w-3xl` | `FormSection` blocks with field groups inside |
| **catalog** | Marketplace: Apps, Skills browse, model picker | `max-w-5xl` | `Item` grid (cards) with optional list/table toggle via `useViewPreference` |
| **hub** | Dashboard Home only — owns the "stateful greeting + setup + recent" pattern | `max-w-5xl` | Mixed; Card panels are OK here |

**Picking the body shape inside `index` / `catalog`** depends on the
*size and uniformity* of the data, not the page type:

- 5–30 visual/logo-y items → `Item` grid (`_template/CatalogPage.tsx`)
- structured uniform rows, sort/filter, 50+ → `DataTable` (`_template/TablePage.tsx`)
- mixed shape per row, text-dominant → `ListRowGroup` (`_template/IndexPage.tsx`)

See the layout decision table in `CLAUDE.md` for the full picker.

Pages declare their type at the top via `<PageContainer type="queue">`.
The container picks the right max-width and outer padding.

## Decision tree: which type is this page?

When adding a new page, walk this tree top-to-bottom — first match wins:

```
Is the page about ONE record (project, routine, conversation, member)?
├── Yes — single-record dwell
│   └── type="detail"      Use DetailHeader; pick a body sub-pattern below
│
├── No — multiple records or no records
    │
    ├── Is it primarily for CREATING or EDITING data (form fields)?
    │   ├── Yes — type="form"      max-w-3xl. FormSection + FieldGroup.
    │   │
    │   └── No — read-mostly
    │       │
    │       ├── Is it a list users SCAN top-to-bottom (one-liners, decisions, log entries)?
    │       │   └── type="queue"     max-w-3xl. ListRowGroup. No Card chrome.
    │       │
    │       ├── Is it a marketplace (browse + filter + install/connect)?
    │       │   └── type="catalog"   max-w-5xl. Card grid + filter row.
    │       │
    │       ├── Is it a grid of "things you'll dwell inside" (projects, workspaces, skills you'll edit)?
    │       │   └── type="index"     max-w-5xl. Card grid 2–3 wide.
    │       │
    │       └── Is it Dashboard Home (mixed greeting + queue + recent + actions)?
    │           └── type="hub"       max-w-5xl. Mixed, Card panels OK here.
```

Need a wider canvas than the type's default? Use the `maxWidth` override
(see Admin / Components / Style Guide for examples — all `form`-type
pages bumped to `6xl` because their content is tabular/showcase-heavy).
**Don't add a 7th type** — `maxWidth` is the escape valve. Categorisation
wars are how design systems get out of control.

Need a fundamentally different shell (full-height chat scroller, marketing
landing)? **Opt out** — render bespoke layout without `<PageContainer>`,
and document why in a comment so future-you doesn't think it's drift.

## Detail-page sub-patterns

Every detail page uses `<DetailHeader>` (back-link + record name + status +
actions) at the top. The body underneath has four legitimate shapes — pick
the one that matches the user's task on this page:

| Sub-pattern | When | Example |
|---|---|---|
| **Single column** | One thing to read, no parallel context | RoutineDetailPage (config + run history stacked) |
| **Two-column split** | Primary content + reference panel beside it | ProjectPage (chats left, memory/instructions/files right) |
| **Three-pane** | Realtime work surface with members/timeline/thread | SpacePage (members · messages · thread) |
| **Tabs** | Same record viewed through different lenses | Profile detail with Activity / Comments / Files tabs |

Don't mix sub-patterns inside one page (e.g. don't put tabs *inside* a
two-column split — the mental model collapses). Pick one and commit.

---

## Spacing rhythm

Pick one ladder. Use only it.

| Token | Use |
|---|---|
| `space-y-1` | Within a row (title + meta) |
| `space-y-2` | Within a section (form fields) |
| `space-y-3` | Between rows in a list |
| `space-y-4` | Between sections inside a region |
| `space-y-6` | Between major page regions |

**Forbidden:** `space-y-5`, `space-y-7`, `space-y-8`, `gap-7`, etc.

---

## Type scale

| Token | Class | Use |
|---|---|---|
| Page H1 | `text-2xl font-semibold tracking-tight` | One per page (PageHeader) |
| Page subtitle | `text-sm text-muted-foreground` | One per page (PageHeader) |
| Section title (uppercase) | `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground` | Group label (Section default) |
| Section title (headline) | `text-base font-semibold tracking-tight` | Sub-section (Section variant=headline) |
| Body | `text-sm` | Default |
| Meta | `text-xs text-muted-foreground` | Timestamps, secondary detail |
| Code / IDs | `text-[11px] font-mono` | Technical detail (always inside HelpDisclosure) |

---

## CTA hierarchy

Each page may have **one primary CTA** in the header. Anything else
demotes:

- **Primary** — solid `Button` in PageHeader trailing slot. Verb-first.
- **Secondary** — outline button next to primary, OR right-aligned link.
- **Tertiary** — kebab menu (`MoreHorizontal` icon → DropdownMenu).
- **Disclosures** ("Technical details", "How this works") — small
  text-button below the subtitle, not in the toolbar.

**Forbidden:** Three or more roughly-equal buttons in a header.

---

## Filter / sub-view pattern

Two distinct languages, never mixed at the same level:

| Intent | Use |
|---|---|
| Switch between sub-pages of one section (Members vs Settings, Profile vs Security) | **Tabs** — `<Tabs>` inside the body, NOT in PageHeader |
| Narrow the list shown below | **PageFilters** — chips + search + sort, between header and body |
| Both at once (Inbox: Undecided/Unread/All sub-views *and* importance chips) | Both, in that order: tabs first, then chips |

PageFilters wraps the existing `Tabs` + chip pattern so every filterable
list looks the same.

---

## State: empty / loading / error parity

Every list, grid, table, or detail has all three states. They share the
same shell:

```
<PageEmpty
  icon={…}
  title="…"           ← What is this?
  description="…"     ← Why is it empty / what does it do?
  action={…}          ← What do I click next?
  tips={[…]}          ← Optional bullets explaining how it works
/>
```

The `EmptyState` primitive is the wire for this. Every `useQuery` should
render:

```tsx
{query.isLoading && <Skeleton variant="…" />}
{query.isError && <PageError onRetry={query.refetch} />}
{query.data && query.data.total === 0 && <PageEmpty … />}
{query.data && query.data.total > 0 && <BodyContent data={query.data} />}
```

Empty / error / loading parity is enforced by code review and by the
`/ux-audit` skill.

---

## Disclosure pattern

For technical detail / IDs / debug payloads / SDK names / MCP URLs:

```tsx
<HelpDisclosure title="Technical details">
  <KeyValueRow label="Approval ID" value={id} mono />
  <KeyValueRow label="Source" value="memory_extraction" mono />
</HelpDisclosure>
```

Anywhere we currently surface a UUID, JSON payload, raw enum, MCP URL,
or stack trace — wrap it in HelpDisclosure. Default-closed. The user
opens it only if they care.

---

## Voice + vocabulary

See `docs/VOCABULARY.md` for the canonical noun / verb / state lists.
Page subtitles must match this template:

> "[Verb in user voice] [thing] [why or how it helps]."

**Good:** "Have your AI do something on a schedule — a daily morning
brief, a weekly digest, a check on stuck leads."
**Bad:** "Manage your account settings and preferences."

---

## Mode hierarchy: Use / Setup / Builder

Every dashboard surface lives in one of three modes:

| Mode | Pages | Audience |
|---|---|---|
| **Use** | Home, Chat, Projects, Spaces, Inbox | Daily users — get work done |
| **Setup** | Connections, Skills, Routines | Setup — add capability |
| **Builder** | Components, Style Guide, Activity, Files (advanced), Voice/Video examples | Builders — develop / debug |

Sidebar groups reflect this. Builder section is hidden by default;
toggled on via the user-menu Builder Mode switch (sets a localStorage
flag — no backend role change). Admin role is separate (still gates
admin panel + member management).

---

## Where this is enforced

- **`src/components/ui/page-header.tsx`** — primitive that sets title
- **`src/components/ui/page-container.tsx`** — primitive that sets max-width
- **`src/components/ui/page-filters.tsx`** — primitive for tabs+chips
- **`src/components/ui/stat-grid.tsx`** — primitive for stat rows
- **`src/components/ui/help-disclosure.tsx`** — primitive for `<details>`
- **`src/client/lib/builder-mode.tsx`** — context + toggle for Builder mode
- **`docs/VOCABULARY.md`** — voice contract
- **`docs/PRIMITIVES.md`** — when to use Card vs ListRow vs Table

---

## Enforcement checklist (PR review + /ux-audit)

For every page change:

- [ ] Page wrapped in `<PageContainer type="…">`
- [ ] Header renders via `<PageHeader title=… subtitle=… />` — NOT hand-rolled
- [ ] At most one primary CTA in header; rest demote
- [ ] If has stats: uses `<StatGrid>` not hand-rolled grid
- [ ] If has filters: uses `<PageFilters>`; sub-pages use `<Tabs>` inside body
- [ ] Empty state uses `<EmptyState>` with `icon + title + description + action`
- [ ] Error state uses `<PageError>` with retry action
- [ ] Loading uses skeleton matching the loaded shape, not bare spinner
- [ ] Technical detail wrapped in `<HelpDisclosure>`
- [ ] Subtitle matches user-voice template (see VOCABULARY.md)
- [ ] No raw enum / class name leaks (use `formatAgentClass` etc.)
- [ ] No `space-y-{5|7|8}` / `gap-{5|7|9}` outside hub type
- [ ] Mobile-checked at 375px width

---

**Last updated:** 2026-04-29
