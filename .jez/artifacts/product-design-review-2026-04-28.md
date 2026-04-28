# Product Design Review — 2026-04-28

**Reviewers:** Claude Opus 4.7 (this document) + GPT-5.5 (peer review at
`.jez/artifacts/live-design-review-2026-04-28.md`).
**Method:** Live signed-in walkthrough of every dashboard surface +
landing + sign-in on https://vite-flare-starter.webfonts.workers.dev/
+ source review of nav, primitives, theme tokens, and module pages.
**Brief:** "Complete design review, every aspect of every page, element,
the user flow. Elevate from where it is to extraordinarily well designed,
brilliantly simple for new users and super capable for experienced users."
**No code changes were made for this review.**

---

## TL;DR

The product is technically strong and individually each page is competent.
But the user's instinct that "there's almost a slight randomness" is correct
and load-bearing — **the randomness IS the diagnosis**. Pages were built
session-by-session and inherited whatever primitives + voice + density felt
right at the time. The fix is not more polish — it's a **page grammar
contract** every page conforms to, enforced by a small set of primitives
that make doing the wrong thing harder than doing the right thing.

GPT-5.5's review (which I read before writing this) nails the
**information-architecture diagnosis**: too much platform exposed at once,
no clear split between Use mode / Setup mode / Builder mode. I agree
strongly. This document **extends** that with three things GPT-5.5
under-weighted:

1. **Visual coherence** — concrete inconsistencies I logged on the walk
   (page-title bug, subtitle voice drift, container-width drift, stat-grid
   drift, card-vs-row drift, CTA hierarchy drift).
2. **A page grammar** — a written contract every page must satisfy, plus
   the primitives needed to enforce it.
3. **Voice + polish** — vocabulary, microinteractions, motion, illustration,
   empty/error/loading parity across the app.

Best moves, ranked by ROI:

1. **Adopt a page grammar contract + build the missing primitives**
   (PageHeader, PageToolbar, StatGrid, FilterBar, SetupCard, KeyValueRow).
   Once these exist, every page snaps to the same skeleton and the
   randomness evaporates.
2. **Mode split (Use / Setup / Builder)** as GPT-5.5 proposed — implement
   as a sidebar reorg + a Builder toggle in the user menu.
3. **Queue model unification**: Inbox is the home, Approvals stays as a
   focused triage page (deep-linked from Inbox), Notifications becomes
   bell-only (drop the page).
4. **Templates-first creation** for Routines, Spaces, Projects.
5. **Skills: Overview tab default**, Source/History/Override behind a
   secondary tab; "Edit" is for builders.
6. **Dashboard Home becomes stateful**: empty / setup / active / builder
   modes pick their own greeting + CTA + content density.
7. **Polish pass**: motion, empty states, error states, microinteractions
   to the level of claude.ai / Linear.

The starter is closer to "extraordinary" than it feels. The randomness is
fixable in one focused refactor pass once the contract is written down.

---

## Diagnosis: the randomness IS the problem

Below is a concrete catalogue of inconsistencies I found in 30 minutes of
live walking. Each is small. The aggregate is what makes the app feel
"slightly random" rather than "designed".

### 1. Page-title bug (browser tab) — 3 pages forgot

The browser tab title:

| Page | Tab title | Correct? |
|---|---|---|
| Dashboard | Home · Vite Flare Starter | ✓ |
| Chat | AI Chat · Vite Flare Starter | ✓ |
| Inbox | Inbox · Vite Flare Starter | ✓ |
| Routines | Routines · Vite Flare Starter | ✓ |
| Notifications | Notifications · Vite Flare Starter | ✓ |
| Approvals | Approvals · Vite Flare Starter | ✓ |
| Files | Files · Vite Flare Starter | ✓ |
| Activity | Activity · Vite Flare Starter | ✓ |
| Extract | Extract · Vite Flare Starter | ✓ |
| **Settings** | **Home · Vite Flare Starter** | ✗ |
| **Admin** | **Home · Vite Flare Starter** | ✗ |
| **Organization** | **Home · Vite Flare Starter** | ✗ |
| **Components** | **Home · Vite Flare Starter** | ✗ |
| **Style Guide** | **Home · Vite Flare Starter** | ✗ |

Five lazy-loaded pages don't set `document.title`. The right fix is to
make a `<PageHeader title="…">` component that *sets* the title as a
side effect, so it can never drift again.

### 2. Subtitle voice drifts between three styles

| Page | Subtitle | Voice |
|---|---|---|
| Routines | "Have your AI do something on a schedule — a daily morning brief, a weekly digest, a check on stuck leads." | User voice ✓ |
| Inbox | "Things your AI noticed, plus anything waiting on a yes / no. Most-important first." | User voice ✓ |
| Approvals | "Your AI is asking before sending an email, posting a message, or updating its memory." | User voice ✓ |
| Skills | "Teach your AI to do specific jobs — write a morning brief, review a contract, draft an email." | User voice ✓ |
| Connectors | "Connect Gmail, Calendar, Drive, Notion, Slack, and other apps so the AI can read and act on them for you." | User voice ✓ |
| Notifications | "Quick pings from across the app. The bell in the header shows the latest 10; this is the full history." | User voice ✓ |
| Projects | "Long-running spaces for your work — chats, files, notes, and memory all in one place." | User voice ✓ |
| Spaces | "Group chats with the AI. Invite teammates, mix in different AI agents…" | User voice ✓ |
| Settings | "Manage your account settings and preferences" | Generic admin |
| Files | "Upload, manage, and share your files" | Generic admin |
| Admin | "Manage people, features, tokens, email logs, and tool errors." | Factual list |
| Activity | "Audit trail of changes you've made — created, updated, archived." | Factual list |
| **Extract** | **"Extract structured data from any text using AI SDK with Zod schemas. Demonstrates Output.object() with tool-capable models."** | **Dev tone — leaks SDK terms** |
| **Organization** | **No subtitle. H1 is the org name + a slug + role inline.** | Missing |

Eight of the recently-touched pages got the user-voice sweep; six didn't
(I missed Settings/Files/Admin/Activity/Extract/Organization in earlier
passes). Extract leaking "AI SDK" and "Output.object()" is an outright
bug — that's developer-doc copy on a user-facing page.

### 3. H1 patterns drift

| Page | H1 |
|---|---|
| Dashboard | "Good night, Jeremy" — time-of-day greeting |
| Chat | "AI Chat" — but the empty state ALSO says "Good night, Jeremy" |
| Settings | "Settings" |
| Admin | "Admin" |
| Files | "Files" |
| Inbox | "Inbox" |
| Activity | "Activity" |
| Routines | "Routines" |
| Skills | "Skills" |
| Connectors | "Connectors" |
| Approvals | "Approvals" |
| Projects | "Projects" |
| Spaces | "Spaces" |
| **Extract** | **"Structured Extract"** — sidebar says just "Extract" |
| **Organization** | **"Personal"** — the org name as the page title |
| **Components** | "Components" |
| **Style Guide** | **"UI Component Library"** — different terminology than nav |

Three problems:
- **Greeting duplication**: Dashboard says "Good night, Jeremy", and Chat
  empty state says it again. In one session you might see it twice within
  10 seconds. It loses meaning.
- **Sidebar/H1 mismatch**: nav says "Extract" but page says "Structured
  Extract"; nav says "Style Guide" but page says "UI Component Library".
  These should always match.
- **Organization H1 = org name**: confusing. Slack and Linear show the
  workspace name in the *sidebar/topbar* and use a stable H1 like "Members"
  or "Team settings". H1 should describe what *this page* is about.

### 4. Stat-block patterns drift (no shared primitive)

Three pages each have their own ad-hoc stat row:

| Page | Layout | Items |
|---|---|---|
| Admin | 4-up | Total Users, Active Sessions, New (7 days), New (30 days) |
| Files | 3-up | Total Files, Storage Used, Folders |
| Activity | 3-up | Total Activities, Today, This Week |

Visually they differ in spacing and emphasis. There's no `StatGrid`
primitive — each page hand-rolls its own. Same primitive should ship
once with: number, label, optional sublabel/trend, even widths, pluggable.

### 5. List rendering: card-wrapped vs row-only — inconsistent

After the recent ListRow refactor:

| Page | Pattern | Should be |
|---|---|---|
| Dashboard "Pending review" | Card with rows inside | Either: (a) drop Card chrome and use ListRowGroup (matches Inbox), or (b) consciously decide queues-on-Home use Card framing for visual grouping |
| Dashboard "Recent agent runs" | Card with rows inside | Same |
| Inbox | ListRowGroup ✓ | ✓ |
| Notifications | ListRowGroup ✓ | ✓ |
| Activity | ListRowGroup ✓ | ✓ |
| Routines | ListRowGroup ✓ | ✓ |
| Connectors workspace integrations | Two large cards (Google + Microsoft) | Reasonable — these are dwell surfaces with multi-line copy + multiple actions |
| Connectors connected apps | Card grid (2-3 wide) | Reasonable — grid view of installed apps |
| Skills | List with custom row layout (not ListRow) | Should be ListRow with skill metadata |
| Projects | Card grid (one per project) | Reasonable for "Project = workspace you dwell in" |
| Spaces | Card grid | Reasonable, same logic |
| Files | Card-wrapped table | Probably should be ListRow per file |
| Admin Users | Table | Table is correct for tabular data |

There's no written rule for *when to use Card vs ListRow vs Table*. The
implicit rule is "queues = ListRow, dwell-surfaces = Card, tabular data =
Table" but it isn't documented and Dashboard + Skills don't follow it.

### 6. CTA hierarchy varies

| Page | CTAs | Hierarchy |
|---|---|---|
| Routines | "New routine" | Single primary ✓ |
| Projects | "New project" + "Show archived" + "Sort by" | Primary + 2 controls ✓ |
| Inbox | (none — filters only) | Filter-only ✓ |
| **Skills** | **"Refresh starter skills" + "Install from GitHub" + "Add skill"** | **Three competing buttons, no clear primary** |
| **Connectors** | **"Browse apps" + "Add custom app" + "Technical details" disclosure** | **Two primaries + a disclosure** |
| Files | "Upload Files" | Single primary ✓ |
| Activity | (none) | Read-only ✓ |
| Dashboard | (no top CTA) | Greeting only ✓ |

Skills + Connectors are the offenders — three roughly-equal buttons make
the user pick by reading rather than by scanning. Pick one primary, demote
the rest into a kebab menu or tucked-away link.

### 7. Container widths drift

Reading the page wrappers:

| Page | Container |
|---|---|
| Dashboard | `max-w-3xl` (estimated from layout) |
| Inbox | `max-w-3xl` |
| Notifications | `max-w-3xl` |
| Routines | `max-w-5xl` |
| Skills | wider (probably `max-w-6xl`) |
| Settings | wider tab layout |
| Connectors | `max-w-5xl` (estimated) |

No rule. Should be: **narrow (3xl)** for queues + dialogs + reading;
**medium (5xl)** for lists with secondary metadata; **wide (7xl)** for
multi-column dwell surfaces. Pick three breakpoints, name them, document.

### 8. Tab vs filter vs chip drift

Same intent ("filter this list") rendered four different ways across the
app:

| Page | Pattern |
|---|---|
| Approvals | `Pending / All` tabs + count |
| Notifications | `All / Unread` tabs + count |
| Inbox | `Undecided / Unread / All` tabs **+ Importance: High Medium Low** chips |
| Projects | `Sort by` dropdown + `Show archived` checkbox |
| Activity | `All actions` dropdown |
| Settings | 8 horizontal tabs (different intent — sub-pages) |
| Admin | 5 tabs (same — sub-pages) |
| Organization | 2 tabs (same — sub-pages) |

Two real intents are colliding: **filter the list shown below** vs **switch
sub-page**. Tabs should be reserved for sub-pages; filters should be a
distinct visual language (chips above the list, dropdowns inline).
Inbox does both at once which is honestly the right pattern for a
filterable queue, but it should be the *canonical* pattern, not Inbox's
local invention.

### 9. Stale meta description

```html
<meta name="description"
  content="Minimal authenticated starter kit for Cloudflare Workers with React, Hono, and better-auth">
```

But the H1 is "Multi-user. Multi-agent. Built at the edge." and the page
sells Spaces, Projects, MCP, voice, video, observability. The meta
description hasn't kept up.

### 10. Quick-action strip on Home is hardcoded

Dashboard's quick-action grid shows the same 4 items (AI Chat / Skills /
Connectors / Projects) regardless of user state — onboarding, active, or
builder. New user with zero connections sees "Skills" and "Projects"
top-billed; experienced user sees the same generic strip. This is the M2
finding from the earlier audit that was deferred.

### 11. Two clocks: greeting on Dashboard *and* Chat empty state

Both surfaces compute "Good night/morning/afternoon, Jeremy". A user
who lands on Dashboard, then opens Chat, gets the same greeting twice
within 10 seconds. The Chat greeting should drop in favour of an action
prompt ("What do you want to do?") or a capability summary ("Connected:
Gmail, Drive, Calendar").

### 12. Connectors information architecture overload

Today's Connectors page renders, top-to-bottom:

1. H1 + subtitle + "Technical details" disclosure
2. Two header CTAs (Browse apps + Add custom app)
3. **Workspace Integrations** section — Google + Microsoft hero cards
4. **Coming Soon** section — Slack + Notion + Atlassian stubs (fake!)
5. **Connected Apps** section — the actual MCP grid

Five sections, two-headers, two-tier copy. New user reads 4 sections
before reaching the live state. "Coming Soon" stubs visible to users
break the product illusion; they belong on a roadmap page or behind
"Browse apps".

### 13. Vocabulary still leaks in places

| Surface | Leaked term |
|---|---|
| Extract page subtitle | "AI SDK", "Zod schemas", "Output.object()", "tool-capable models" |
| Approvals card metadata | "from memory_extraction" (we collapsed this in plain title but it still appears in source label) |
| Routines list | "AI assistant" (the agent name) — should match Skills/Connectors phrasing of "Your AI" |
| Notification text | Some notifications are emitted by skills with raw skill ids in the title |
| Dashboard "Recent agent runs" | "Researcher / Writer / AI assistant" — agent class names instead of routine names |

The format helpers (`formatAgentClass`, `formatOutcome`, etc.) are doing
their job where wired, but several surfaces never adopted them.

---

## Where I agree, disagree, and extend GPT-5.5's review

GPT-5.5's review is genuinely good. Their core split (Use / Setup /
Builder) is the right framing and I'm adopting it.

### Strong agreement

- **Use / Setup / Builder mode split** — yes. This is the structural fix.
- **Templates-first Routines + Spaces + Projects** — yes. The current
  config-first flow makes a new user learn the abstraction before
  seeing value.
- **Connectors as marketplace, not infra** — yes. Section 3 of GPT-5.5's
  review is the right shape.
- **Skills: Overview default tab, Source secondary** — yes. Source-first
  is for builders only.
- **Hide Components + Style Guide + Activity from primary nav** — yes.
- **Setup checklist on Home** — yes.
- **Stale landing meta** — yes (logged separately above).
- **Settings tabs overflow on mobile** — yes.

### Where I'd push back or refine

**1. Don't fully fold Approvals into Inbox.** GPT-5.5 proposes a single
"Inbox" with filters that include Approvals. I'd argue:

- **Inbox** = "things to look at" — findings + unread notifications + the
  most urgent approvals. One unified queue.
- **Approvals** = the focused triage page with the approval card UI, bulk
  actions, "approve and stop asking" memory. It's a different *task* —
  Inbox is "what should I look at?", Approvals is "I'm here to triage".

So: **Inbox surfaces approvals**, but `/dashboard/approvals` stays as a
deep-linked view for the triage task. Both share the data model;
neither is a peer primary destination *with notifications*. Notifications
become bell-only (the page goes away — bell already shows last 10;
deep-link to filtered Inbox for the rest).

This collapses 3 sidebar items → 1 (Inbox), with a deep-link route to
Approvals from inside it.

**2. Renaming Connectors → Connections is a 50/50.** "Connectors" reads
as infrastructure (correctly — they ARE MCP/OAuth connectors). "Connections"
reads like LinkedIn relationships and is also overloaded. I'd consider:

- **Apps** — short, clear, marketplace-friendly
- **Integrations** — boring but unambiguous
- **Connected apps** — accurate description

My pick: **Apps**, with sidebar tooltip "Connect Gmail, Drive, Calendar
…". One word, scannable.

**3. Hide Activity from primary nav, but make it discoverable from
context.** Don't bury it under Builder mode entirely. Add a "View
all activity" link to the "Recent agent runs" panel on Dashboard. That
way activity is one click from where it's needed.

**4. Builder mode should be a session toggle, not a role.** Like dark
mode — a user-menu toggle that flips a flag in localStorage. Reveals
Components / Style Guide / Activity / raw skill source / detailed
technical disclosures. Doesn't require admin role; doesn't change
backend behaviour. A second category — **Admin features** (admin panel,
user management) — stays gated by role as today.

**5. "Adopt a page grammar" needs to be specified, not just stated.**
GPT-5.5 lists six visual-system bullets. I'm going to write the actual
contract below, with primitives.

### What I add that GPT-5.5 under-weighted

1. **The page grammar contract** — every page has the same skeleton.
2. **Concrete primitives needed** — what to build, what to remove.
3. **Vocabulary contract** extending docs/VOCABULARY.md with the leaks
   I found.
4. **Polish dimension** — motion, microinteractions, loading parity,
   error parity, illustration system, sound (optional).
5. **Specific bug list** — the page-title bug, stale meta, quick-action
   adapt-to-state, etc.
6. **Code-aware reality check** — what's a 1-day patch vs a 2-week refactor.

---

## The page grammar contract

This is the rule every page must satisfy. Once written down + enforced
by primitives, the randomness collapses.

### Required structure

Every dashboard page renders, top to bottom:

```
[ <PageHeader> ]   ← title + subtitle + optional toolbar
[ <PageStats?> ]   ← optional 1-row stat grid (≤4 items)
[ <PageFilters?> ] ← optional filter chips/tabs/search
[ <PageBody> ]     ← the work content (list, grid, form, detail)
[ <PageFooter?> ]  ← optional bulk-action footer that floats up on selection
```

No page is allowed to invent its own header, its own subtitle styling, or
its own stat layout. PageHeader is the *only* place a page can declare
its name; it sets `document.title` automatically. End of page-title bug.

### Required types

Every page declares one of:

| Type | Use when | Container | Visual language |
|---|---|---|---|
| **Queue** | Triaging items (Inbox, Notifications, Approvals, Activity, Routines list) | `max-w-3xl` | ListRowGroup, no Card chrome around rows |
| **Index** | Dwell surfaces (Projects, Spaces, Skills) | `max-w-5xl` | Card grid 2-3 wide |
| **Detail** | Single-record dwell (Project page, Routine detail, Conversation) | `max-w-5xl` to `7xl` | Section blocks |
| **Form** | Create/edit (New Routine, Settings tabs) | `max-w-3xl` | Field groups in Section blocks |
| **Catalog** | Marketplace (Apps, Skills browse) | `max-w-5xl` | Card grid, filter sidebar |
| **Hub** | Dashboard Home only | `max-w-5xl` | Mixed — owns the home pattern |

The current app has all six types but doesn't *name* them, so each page
re-discovers its own container width and rhythm. Naming them = solving it.

### Required spacing rhythm

Pick one. Document it. Enforce in PageHeader/PageBody:

| Token | Use |
|---|---|
| `space-y-1` | Within a row (title + meta) |
| `space-y-2` | Within a section (form fields) |
| `space-y-3` | Between rows in a list |
| `space-y-4` | Between sections |
| `space-y-6` | Between major page regions |
| `space-y-8` | Hero/setup spacing only |

Today, pages range from `space-y-3` to `space-y-8` with no rhythm.
Pick one ladder and use only it.

### Required vertical padding

| Container | Padding |
|---|---|
| Page outer | `py-6 sm:py-8 px-4 sm:px-6` |
| Card body | `p-4` (compact) or `p-6` (spacious) — never both on the same page |
| List row | `px-3 py-2.5` (the ListRow default — keep it) |
| Section | `space-y-3` between header + body |

### Required type scale

| Token | Size | Use |
|---|---|---|
| Page H1 | `text-2xl font-semibold tracking-tight` | One per page |
| Page subtitle | `text-sm text-muted-foreground` | One per page |
| Section title (uppercase) | `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground` | Group label |
| Section title (headline) | `text-base font-semibold tracking-tight` | Sub-section heading |
| Body | `text-sm` | Default |
| Meta | `text-xs text-muted-foreground` | Timestamps, secondary |
| Code/IDs | `text-[11px] font-mono` | Technical detail |

The Section primitive already exposes `default` + `headline` variants.
Good. Lock that in everywhere.

### Required CTA hierarchy

Every page may have **one primary CTA** in the page header. Anything
else demotes:

- Secondary action → outline button next to primary OR right-side dropdown
- Tertiary actions (Refresh, Import, Add custom, Browse) → kebab menu
  or "More" dropdown
- Disclosures (Technical details, Help) → small text-button below the
  subtitle

Skills and Connectors get fixed by this rule alone.

### Required filter pattern

Two distinct languages, never mixed:

- **Tabs** for *sub-views* (Pending / All; Members / Settings; Profile / Security / Sessions / API Tokens / …)
- **Filter chips + search bar** for *narrowing the list shown* (Importance: High/Medium/Low; All actions / Created / Updated / Archived)

Inbox got this right (tabs *and* chips, distinct purposes). The pattern
should be hoisted into a `<PageFilters>` primitive.

### Required empty / loading / error parity

Every list, grid, table, or detail has all three states. They share
the same shell:

```
<EmptyState
  icon={…}
  title="…"        ← What is this?
  description="…"  ← Why is it empty / what does it do?
  action={…}       ← What do I click next?
  tips={[…]}       ← Optional: small bullets explaining how it works
/>
```

EmptyState already exists. The work is auditing every list to make sure
all three states are wired, not just the data state.

### Required disclosure pattern

For technical detail / IDs / debug payloads / SDK names:

```
<details>
  <summary>Technical details</summary>
  <KeyValueRow … />
  <CodeBlock … />
</details>
```

Already established on Approvals + Connectors. Extend across the app.
Anywhere we currently surface a UUID, JSON payload, raw enum, MCP URL,
or debug stack — wrap it.

---

## Primitives library — what we have, what we need

### What we already have (good shape)

| Primitive | File | Notes |
|---|---|---|
| Button | `components/ui/button.tsx` | Variants: default, outline, ghost, destructive, secondary |
| Card | `components/ui/card.tsx` | Header / Content / Footer |
| ListRow + ListRowGroup | `components/ui/list-row.tsx` | Just shipped — variants: default/plain, state: default/unread/urgent/disabled |
| Section | `components/ui/section.tsx` | Just shipped — variants: default/headline |
| EmptyState | `client/components/EmptyState.tsx` | Has icon/title/description/tips/action |
| Tabs | `components/ui/tabs.tsx` | Standard shadcn |
| Combobox + Picker | `components/ui/combobox.tsx` + `routines/components/RoutinePickers.tsx` | Good for discovery |
| Sidebar | `components/ui/sidebar.tsx` | Slack/Linear-style with sections + collapse |
| Input + Textarea + Select | `components/ui/{input,textarea,select}.tsx` | Standard |
| Dialog + AlertDialog + Drawer | Standard | |
| Skeleton + Spinner | `components/ui/skeleton.tsx` + `spinner.tsx` | |
| Sonner toast | `components/ui/sonner.tsx` | Standard |
| ConfigDiffCard | `client/components/ConfigDiffCard.tsx` | Approval card pattern with line diff |
| KbdHint | `components/ui/kbd.tsx` | Keyboard shortcut display |

### What we need (missing, hand-rolled today)

| Primitive | Replaces | Owner |
|---|---|---|
| **PageHeader** | Per-page hand-rolled `<div className="flex items-start justify-between gap-4"><div><h1>…</h1><p>…</p></div></div>` everywhere | New |
| **PageToolbar** | Right-side header CTAs cluster | New |
| **StatGrid + StatCard** | Hand-rolled stat rows on Admin / Files / Activity | New |
| **PageFilters** | Hand-rolled tab+chip mix on Inbox; separate dropdown on Projects/Activity | New |
| **KeyValueRow** | Hand-rolled `<div><dt>…<dd>…` everywhere in technical disclosures | New |
| **MetaList** | Inline meta row (`X · Y · Z`) currently rendered as flex+gap-1 spans | New (or extend ListRowMeta) |
| **SetupCard / ChecklistCard** | New onboarding panel for Home setup steps | New |
| **CapabilityChip / ConnectionPill** | Display "Gmail / Drive / Calendar connected" inline | New |
| **HelpDisclosure** | The `<details>` "Technical details" pattern, but as a primitive | New |
| **BuilderModeProvider** | Toggle that gates Components / Style Guide / raw source | New |
| **PageEmpty + PageError + PageLoading** | Three-state shell so every page renders the same way per state | New (compose from EmptyState + Skeleton) |

These are roughly half-day primitives each. The leverage is enormous —
once `<PageHeader>` exists, every subsequent page is 5 lines of header
code instead of 30, and they're all coherent by construction.

### Anti-primitives — things to remove

| Pattern | Reason |
|---|---|
| Per-page hand-rolled `document.title = …` | PageHeader sets it |
| Per-page hand-rolled stat rows | StatGrid does it |
| Per-page mix of `space-y-3 / 4 / 6 / 8` | PageBody picks the rhythm |
| Per-page hand-rolled "section title + description + trailing button" | Section already does this; some pages didn't adopt it |
| Per-page hand-rolled disclosures | HelpDisclosure does it |

---

## The mode split (Use / Setup / Builder) — how it lands in code

Borrowed framing from GPT-5.5; here's how it touches the code.

### Sidebar reorg

Current:

```
Main: Home, AI Chat, Projects, Spaces, Skills, Connectors, Routines
You:  Inbox, Notifications, Approvals
More: Extract, Files, Activity, Voice/Video examples (collapsed)
```

Proposed:

```
WORK
  Home
  Chat
  Projects
  Spaces
  Inbox        ← single queue (absorbs Notifications + surfaces Approvals)

SETUP
  Apps         ← (renamed from Connectors)
  Skills
  Routines

(builder mode toggle on)
BUILDER
  Components
  Style Guide
  Activity
  Files (advanced)
  Voice / Video examples

(footer of sidebar — stays as today)
  Org switcher / user menu
```

Three changes from today:
- Notifications page goes away (bell-only).
- Approvals demoted from primary nav (still a deep-link / inside Inbox).
- New section labels reflect Use/Setup intent.

### User menu

The user menu in the sidebar footer gets:

- Profile / preferences (links to Settings tabs)
- Theme (already there)
- **Builder mode toggle** ← new, with description "Show developer surfaces"
- Sign out

Builder mode is a `localStorage` flag read at app boot. No backend role
change.

### Routes that don't move

All current routes stay valid. The reorg is only sidebar visibility +
discoverability. Bookmarked URLs continue to work — bookmarks like
`/dashboard/notifications` still load the page; they're just not surfaced
in primary nav.

---

## Voice + vocabulary contract (extending docs/VOCABULARY.md)

Current VOCABULARY.md is a strong start. Extend it with these decisions
and missed cases.

### One name per concept

| Concept | Name | Forbidden synonyms |
|---|---|---|
| The AI | "Your AI" or "the AI" (lowercase) | "The agent", "the assistant", "AI assistant", "Claude" |
| A scheduled job | "Routine" | "Cron", "Job", "Task", "Sweeper" |
| A stored procedure for the AI | "Skill" | "Recipe", "Procedure", "Prompt" |
| A connected service | "App" | "Connector", "Connection", "Integration", "MCP server" (in user-facing copy) |
| A request from the AI for permission | "Pending review" | "Approval request", "Approval", "Permission grant" |
| A finding the AI surfaced | "Finding" | "Item", "Result", "Inbox item" |
| A long-running workspace | "Project" | "Workspace", "Container" |
| A multi-user multi-agent room | "Space" | "Room", "Channel", "Workspace" |

### Page subtitle template

> "[Verb in user's voice] [thing] [why or how it helps]."

Good: "Have your AI do something on a schedule — a daily morning brief,
a weekly digest, a check on stuck leads."
Bad: "Manage your account settings and preferences."

Audit pass: Rewrite Settings / Files / Admin / Activity / Extract /
Organization subtitles to fit the template.

### Empty state copy template

```
Title: "[What this is]"
Description: "[One sentence: what it does + when it shows up]"
Action: "[Single verb-led CTA]"
```

Good (Inbox empty): "Nothing waiting. Your AI hasn't surfaced anything
since you last checked."
Bad: "No items found."

### Button label rules

- Verb-first ("Create routine", not "Routine creation")
- Title case for primary CTAs ("Create routine"), sentence case for
  secondary ("Show archived")
- ≤3 words for primary, ≤5 for secondary
- "Save" / "Create" / "Update" / "Send" / "Approve" / "Reject" — verbs we
  pick for the action, never "OK" / "Submit" / "Confirm" / "Yes"

### Vocabulary leaks audit (specific fixes)

| Surface | Today | Should be |
|---|---|---|
| Extract subtitle | "AI SDK with Zod schemas. Demonstrates Output.object() with tool-capable models." | "Pull structured data from any text — names, dates, sentiment, custom schemas." |
| Approvals row "From AI memory · about 22 hours ago" | OK | OK |
| Approvals technical details | "memory_extraction" raw event type visible | Hide behind `<details>`, label as "From AI memory" already |
| Routines list row "AI assistant" | The agent class label | Rename to **agent's display name** (using `formatAgentClass`) |
| Dashboard "Recent agent runs" | "AI assistant / Researcher / Writer" | Show **routine name** if a routine fired it; agent name only for ad-hoc chat |
| Notification text from skills | Raw skill slug | `formatSkillName(slug)` helper that titlecases + de-hyphens |
| Files subtitle | "Upload, manage, and share your files" | "Drop a file here or in chat — your AI can read it, summarise it, or extract data." |
| Settings subtitle | "Manage your account settings and preferences" | "Your profile, login, AI memory, and the data this app holds about you." |
| Admin subtitle | "Manage people, features, tokens, email logs, and tool errors" | "Members, feature flags, API tokens, deliverability, and error inspection." |
| Activity subtitle | "Audit trail of changes you've made — created, updated, archived." | "Every action your AI has taken on your behalf, with timestamps." |
| Organization H1 | "Personal" (the org name) | "Members" (or whatever the active tab is); org name lives in sidebar |

---

## Page-by-page critique

I'll skip the pages where GPT-5.5's findings are correct and stand —
this is my code-aware delta plus things I noticed they didn't.

### Dashboard Home

**Today**: Greeting → "Pending review" panel (3 items) → "Recent agent runs"
panel → Quick actions → "What this starter ships with" reference.

**My adds**:
- The H1 greeting is the right hero, but it should adapt:
  - First-run user: "Welcome, Jeremy" + setup checklist as the dominant block
  - Active user (has work): "Good night, Jeremy" + Pending review (today's behavior)
  - Returning user with nothing waiting: "All clear, Jeremy" + recent activity
- "What this starter ships with" — this whole section is a *fork-author
  overview*, not a *user* overview. It belongs on `/dashboard?builder=true`
  or in the user menu's "About" panel, not on the Home of every user
  forever. Today it's the most prominent thing below the fold.
- Quick actions strip should be 4 *contextual* CTAs, not 4 fixed:
  - No connections → "Connect Gmail" + "Connect Slack" + "Try a chat" + "Browse skills"
  - 1+ connection → "Start a chat" + "New project" + "Browse routines" + "Manage apps"
  - Heavy user → "Resume Pirate Lab" + "Start a chat" + "Inbox (3)" + "New routine"
- The "Pending review" panel currently uses a Card. Decide: keep Card on
  Dashboard for visual grouping, or strip to ListRowGroup matching Inbox.
  I'd keep Card on Home (where it acts as a section visual anchor) and
  document the rule: **Home = dashboard cards; standalone pages = bare
  list rows.**

### AI Chat

**Today**: Greeting + email + 5 chip presets + 4 starter prompts + model
picker + attach button + input.

**My adds**:
- Drop the secondary "Good night, Jeremy" greeting — it duplicates Home.
  Replace with **capability summary**: a one-line `<CapabilityChip>` row
  showing what's connected: "Connected: Gmail, Drive, Calendar · 22 skills
  available · 16 models". This is information; the greeting is fluff.
- The model picker is excellent (16 models, pricing, "via OpenRouter"
  hints) but it should remember the user's recent picks at the top.
- Suggested prompts should adapt to **current connections**:
  - Gmail connected: "Summarise unread emails"
  - Drive connected: "Find docs about Q3 planning"
  - No connections: today's generic prompts
- The starter chips (Write / Research / Code / Plan / Local) — clarify
  what each does on hover or in a kbd hint.
- Empty-state header could include a **microcopy line** about what to do:
  "Type, dictate (mic icon top-right), or drop a file." Today the user
  has to discover the dictation button.

### Projects (index)

**Today**: H1 + subtitle + New project + Show archived + Sort by + grid
of project cards.

**My adds**:
- One-project state is sparse. Add a **starter templates row** when
  user has ≤2 projects: "From a goal", "Research", "Writing", "Code",
  "Brainstorm" — same shape Spaces should adopt.
- The card density is fine; consider adding a "+ New project" tile at
  end of grid (Slack/Notion pattern) so the CTA never disappears as
  user scrolls.

### Project detail

**Today**: Tabs for chats / files / memory / instructions.

**My adds**:
- Make "Start chat" the unmistakable primary action — bigger, hero-like,
  on the right or top of the detail.
- Memory + Instructions panels should expose what they do in the empty
  state ("Memory holds notes the AI carries between chats. Add a fact
  here and the AI uses it next time you chat.").

### Spaces (index + detail)

GPT-5.5 covered this well; my add: **template-first creation** is the
biggest unlock. The "create space" form asks for 5 things up front
(name, agents, reply mode, …). A new user doesn't know which agents
they want until they've seen one work. Templates: "Solo workshop",
"Support room", "Research room", "Writer room" — each preconfigures
agents + reply mode + welcome composer hint.

### Skills

**My adds beyond GPT-5.5**:
- The 22-skill list with raw `/code-review`, `/draft-email` slugs is fine
  for builders but reads as command-line. For users, the **slash-name
  becomes a hidden detail under "How to use"**, and the visible label is
  the human name ("Code review", "Draft email") + the description.
- The current "bundled" badge is leakage of internal taxonomy. Replace
  with provenance icons: 📦 starter / 👤 yours / 🐙 GitHub.
- "Refresh starter skills" + "Install from GitHub" + "Add skill" → kebab.
  Primary CTA: "Add skill". Everything else inside.
- Default tab on detail: **Overview** (description, when to use, example
  prompts, used by, enable toggle). Source / History / Override behind
  Builder mode.
- Include a **"Try this skill"** button on the overview tab — opens
  Chat with `/skill-name` pre-filled.

### Connectors → Apps

**My adds**:
- Drop "Coming soon" stubs entirely from the live page. Move to a
  separate `/dashboard/apps?show=upcoming` filter or just remove.
- Workspace integrations (Google + Microsoft) become **featured installs**
  at top of catalogue, not a separate section.
- MCP grid becomes the body of the catalogue. Sort: Recommended →
  Connected → Available → Disconnected/expired (last).
- "Add custom app" → secondary kebab item (it's an advanced action).
- Per-card CTA states: "Connect" / "Connected · Manage" / "Reconnect"
  / "Configure". Today some cards say "Connect", others say "Open in
  new tab", inconsistent.

### Routines

**My adds**:
- The list view is fine; the new-routine flow is the lever.
- Templates: **"Morning brief", "Triage emails", "Stuck deals", "Daily
  blockers", "Custom"**. Each template fills name, agent, cadence,
  skills, tools, hook so the user only fills the bits unique to them.
- After save, show a `<TestFireCard>` with "Run now" + a snapshot of
  what fired (latest agent_runs row). Currently the user has to click
  through to detail page.
- Inline schedule preview: "Next run: in 23 minutes · Then daily at
  9:00am Sydney" — uses humanised cron text, current code already has
  the helper.

### New Routine page (when not template-first)

**My adds**:
- Today's plain-language section labels are great. The tools picker
  defaults to "All tools available". For a new user this is a *safer
  default* than empty (empty = doesn't work yet) but it's also
  *frighteningly broad* (95+ tools available!). Consider defaulting
  to the agent's recommended toolset based on agent metadata.
- The "When the agent finishes a run, run this skill" hook field is
  buried at the bottom. Most users won't want it. Move under "Advanced"
  disclosure.
- Save button placement: today bottom-of-form. Add sticky bottom bar:
  "Save & test" + "Save" + "Cancel".

### Inbox

**My adds**:
- This is the new home for **all queued items** under the proposed
  reorg. Filters become: All / Needs review / Findings / Alerts.
- Bulk actions: select rows → footer floats up with "Mark read /
  Approve / Reject / Archive". Linear-style.
- Empty state per filter: "No findings yet — your AI hasn't noticed
  anything since you last checked. Routines run every 15 min."
- Importance chips become **Sort by** dropdown ("Most important" /
  "Newest" / "Oldest"). High/Medium/Low filtering is a power user
  task; default is fine.

### Approvals (deep-link from Inbox)

**My adds**:
- Page stays as today's focused triage view, but framed as a
  drill-down: breadcrumb shows "Inbox · Pending review (3)".
- Keyboard shortcuts: `j/k` next/prev, `a` approve, `r` reject, `?` help.
  Power-user delight.
- Mass approve: header gets "Approve all from AI memory" when filtered
  by source. Saves clicks for users with backlog.

### Notifications page → goes away

Bell stays. The page becomes a deep-link to Inbox filtered to "Alerts".
One sidebar item gone, no functionality lost.

### Activity

**My adds**:
- Hide from primary nav (Builder mode only) but link from Dashboard
  "Recent agent runs" panel: "View all activity →".
- Filter by entity type (Conversation, Routine, Approval, Memory) +
  time range. Today's "All actions" dropdown is OK but missing entity
  filter.
- Each row should link to the entity if it still exists (today they
  show "Created Conversation" but you can't click through).

### Files

**My adds**:
- Big drop-zone empty state: "Drop a file here. Or use chat to upload —
  your AI can read PDFs, images, and CSVs." Today's "Total Files / Storage
  Used / Folders" stat row above an empty list is upside down.
- Per-file row: filename + thumbnail + size + uploader + "Used by N
  chats" + actions kebab.
- The "Not indexed" badge on save-test-1776770053725.png is opaque —
  what does indexed mean? Tooltip or "?" icon explaining.

### Settings

**My adds**:
- 8 tabs is too many for a sidebar that mobile collapses into a
  horizontal strip. Mobile fix: use `<NativeSelect>` to switch tabs.
- Group the 8 tabs into 3 super-categories:
  - **Account**: Profile, Security, Sessions, API Tokens
  - **AI**: AI defaults, Memory
  - **Org**: Organization, Preferences
- The Profile tab subtitle "Update your personal details and avatar" is
  factual but bland. Voice it: "Your name, email, and photo — what your
  teammates see."

### Admin

**My adds**:
- Stays gated by role. Stats row should use the new StatGrid primitive.
- Tool-errors tab is the most powerful debug surface — link from
  Activity rows that errored ("Tool error · view in Admin →").
- Top of admin page should explain: "Admin features only — your team
  members don't see this." Avoids "why does X have admin?" confusion.

### Organization

**My adds**:
- H1 should be "Members" (matching the active tab) or "Organization
  settings". Org name lives in the sidebar org switcher only.
- Members tab is fine. Settings tab should have: org name, slug, logo,
  default seat role, billing (placeholder).
- "Slug: personal-OG6MLVX9" — humans never need to read a UUID-y slug.
  Hide it under Builder mode.

### Extract

**My adds**:
- This is GPT-5.5's "feels like a standalone demo" call, and they're
  right. Either:
  - **Promote** to a primary tool — give it use cases ("Pull data from
    invoices", "Get sentiment from reviews", "Extract people + places
    from emails"), templates, and a "Send to chat" handoff.
  - **Demote** to a chat tool — `extract_data` becomes a tool the chat
    agent can call, with the same Zod schema picker rendered inline. The
    standalone page goes away.
- Subtitle: rewrite to drop "AI SDK", "Zod schemas", "Output.object()".

### Components / Style Guide

**My adds**:
- Both go behind Builder mode. Both have rich content; both are
  developer-facing.
- They're also **incomplete as a style guide**: missing the new
  primitives (ListRow, Section), missing tokens documentation, missing
  page-grammar examples. The work below makes Style Guide actually
  useful again.

### Sign-in / Sign-up / Forgot / Reset / Verify

**My adds**:
- Sign-in is too sparse, GPT-5.5 right.
- Add a "What can this AI do?" sidebar panel (1 column on left, sign-in
  on right) that previews 3-4 use cases. Linear/Notion do this.
- Trust copy: "Google sign-in lets the app connect securely to the apps
  you approve — Gmail, Drive, Calendar."
- Footer: "Made by Jezweb · Pattern library on GitHub" link.

### Landing page

**My adds beyond GPT-5.5**:
- The H1 "Multi-user. Multi-agent. Built at the edge." is a *builder*
  pitch. Right audience for fork-users; wrong for end users.
- Two-lane landing: a header toggle "I want to use it" / "I want to
  fork it" — switches the H1, hero CTA, and proof points.
- Above-the-fold should show **a real product screenshot** (the chat
  empty state, the inbox, or a Skills row). Today the hero is
  abstract.
- "95+ agent tools / 16 AI models / 30+ modules / 4 agent kinds" — these
  are *spec-sheet* numbers. Replace with **outcome statements**: "Read
  email. Draft replies. Watch your CRM. Run on a schedule. Your data,
  your AI, your domain."
- Fix the stale meta description.

### Mobile (overall)

**My adds**:
- Settings tabs on mobile: replace with `<NativeSelect>` per the rule
  above.
- Sidebar opens, but header doesn't lose chrome (Search ⌘K, theme
  toggle) — too much top-bar fighting for tap targets. Hide search +
  theme on small viewports; expose via long-press on nav.
- Inbox mobile rows: today fine. Add swipe-to-mark-read pattern (Linear
  / Mail.app).
- New-routine mobile is a long form. Add **stepper UI** on small
  viewports — one section at a time with Next/Back.

---

## The polish dimension (what makes it "delightful")

Design coherence + IA fix + voice = *competent*. Delight is:

### Motion + microinteractions

Adopt one motion language. Suggested: **spring-natural** (Framer Motion
default) for everything except small UI feedback (hover, tap), which
gets fast linear easings.

| Surface | Motion |
|---|---|
| Sidebar nav item active state | Slide a 2px `bg-primary` rail in from left over 120ms |
| List row hover | Background fade in/out 100ms |
| Card hover | Subtle elevation + 1px scale 150ms |
| Approve/Reject buttons | Tap scales to 0.97 then back |
| Toast (sonner) | Slide in from top-right with stagger |
| Sheet/Drawer open | Slide + scrim fade 220ms |
| Modal open | Scale from 0.95 → 1 with scrim fade 200ms |
| Page transition | None on internal nav (instant); 80ms fade for cross-section |
| Skeleton → real content | Crossfade 150ms |

Today the app uses default Tailwind transitions on hover (good) and
tw-animate-css for some (good) — but no consistent motion design. Lock
it in `~/Documents/vite-flare-starter/src/index.css` with a token table.

### Empty state illustration system

Three states need illustrations. Three, not 50:

- Generic empty (📦 + abstract dots)
- All clear (✅ + soft glow)
- Error (⚠ + dim)

A small SVG set, monochrome, theme-aware. Don't ship per-page bespoke
illustrations — that way randomness lies. lucide-react provides serviceable
icons; pick three icon-only treatments and reuse.

### Sound (optional, opt-in)

Probably not now. If you want it, the moves are:
- Subtle "ding" when an approval lands in the queue
- Subtle "swoosh" when a chat message sends
- Tap "tick" on approve/reject

All under 100ms, low frequency. Setting toggle: off by default.

### Loading parity

Every page renders a skeleton in the same shape as its loaded state.
The current `client/components/skeletons.tsx` has StatCard, Table,
Chart, List, Page — good. Audit: every page picks the matching shape;
no page renders a bare `<Loader2>` in the body anymore.

### Error parity

Every page handles its API error path identically:

```
<EmptyState
  icon={AlertTriangle}
  title="Couldn't load [thing]"
  description="[friendly explanation]"
  action={{ label: 'Try again', onClick: refetch }}
/>
```

Today most pages don't render error states; they just show empty data
with no signal something failed.

### Brand voice in microcopy

Pick a voice and stick to it. Today's tone is **warm direct Jezweb** in
the recently-touched pages and **enterprise-bland** in the older ones.
One voice. Friendly, second-person, low jargon, occasional humour
(Australian-spelled). Audit pass on every string.

### Keyboard layer

For power users, this is delight:

- `⌘K` — already wired (Command Palette)
- `g h` / `g i` / `g c` — go-to home / inbox / chat (Linear pattern)
- `j` / `k` — next / prev row in any list
- `?` — show all shortcuts
- `n` — new (context-aware: new routine on Routines page, new project on
  Projects page)
- `c` — compose (start chat from anywhere)
- `e` — edit (on a detail page)

Today: ⌘K + ? are wired. Extend with go-to + j/k + n + c.

### Status indicators that never lie

- **Live update badge** — when data is fetching in the background, show
  a tiny spinning dot in the page header (TanStack Query already exposes
  `isFetching`). Nobody notices a 200ms refetch but it builds trust.
- **Last updated** — every list shows "updated 2 sec ago" so the user
  knows freshness.
- **Connection state** — sidebar org switcher shows a small green dot
  if the workspace integrations are healthy, amber if any token expired.

---

## Bug list (concrete, actionable)

| # | Bug | Location | Fix |
|---|---|---|---|
| B1 | Browser tab title says "Home · Vite Flare Starter" on Settings/Admin/Organization/Components/Style Guide | 5 lazy-loaded pages | Build PageHeader; sets title in useEffect |
| B2 | Stale `<meta name="description">` on landing | `index.html` | Update to match current value-prop |
| B3 | Extract subtitle leaks SDK terms | `ExtractPage.tsx` | Rewrite to user voice |
| B4 | Skills shows raw `bundled` badge | `SkillsPage.tsx` | Provenance icon set |
| B5 | "Coming soon" stubs in Connectors visible to users | `ConnectorsPage.tsx` | Remove or hide behind toggle |
| B6 | Greeting duplicated on Dashboard + Chat empty | `DashboardPage.tsx` + `ChatPage.tsx` | Drop Chat greeting; add capability chip |
| B7 | Quick actions on Dashboard hardcoded | `DashboardPage.tsx` | Adapt to user state (M2 from earlier audit) |
| B8 | Organization H1 = org name | `OrganizationPage.tsx` | Use tab name as H1; org name in sidebar |
| B9 | Notifications page is bell-redundant primary nav | `nav.ts` | Remove from sidebar; bell-only |
| B10 | Components / Style Guide visible in production by default | `nav.ts` + `features.ts` | Builder mode toggle |
| B11 | Skill list label `/skill-slash-name` first-billed | `SkillsPage.tsx` | Show display name first; slash-name as detail |
| B12 | Recent agent runs shows class names | `DashboardPage.tsx` | Use `formatAgentClass` + show routine name when fired by routine |
| B13 | "Not indexed" badge on file is opaque | `FilesPage.tsx` | Tooltip explaining indexing |
| B14 | Settings 8 tabs on mobile becomes a horizontal strip | `SettingsPage.tsx` | NativeSelect on `< sm` |
| B15 | Stat rows on Admin/Files/Activity are hand-rolled | 3 pages | Build StatGrid primitive, retrofit |
| B16 | Dashboard "What this starter ships with" is fork-author content shown to users | `DashboardPage.tsx` | Builder-mode only or move to user-menu "About" |
| B17 | Subtitle voice on Settings/Files/Admin/Activity is bland | 4 pages | Rewrite per voice contract |
| B18 | Time-of-day greeting computes twice (Home + Chat) | shared hook | One hook, one greeting per session ideally |
| B19 | Activity page rows aren't clickable to entities | `ActivityPage.tsx` | Wire entity links |
| B20 | Approvals lacks keyboard shortcuts | `ApprovalsPage.tsx` | j/k/a/r/? |

Most of these are 5-30 minute fixes once primitives exist.

---

## Phased plan (extends GPT-5.5's plan with code-aware reality check)

### Phase 0 — The contract (1-2 sessions, no UI changes user-visible)

Write down what we're building TO before building. Deliverables:

1. `docs/PAGE_GRAMMAR.md` — the contract above
2. `docs/PRIMITIVES.md` — what we have, what we need, decision tree for
   when to use Card vs ListRow vs Table
3. Extend `docs/VOCABULARY.md` with the leaks audit
4. `src/components/ui/page-header.tsx` (new primitive — sets title)
5. `src/components/ui/page-toolbar.tsx` (new primitive)
6. `src/components/ui/stat-grid.tsx` (new primitive)
7. `src/components/ui/page-filters.tsx` (new primitive — tabs + chips)
8. `src/components/ui/key-value-row.tsx` (new primitive)
9. `src/components/ui/help-disclosure.tsx` (new primitive)
10. `src/client/lib/builder-mode.ts` + provider (new primitive)

Once these exist, every subsequent page change is small.

### Phase 1 — Calm the shell (1 session)

Hand-fix the bugs that cost 5 minutes each:

- Wire PageHeader on every page → fixes B1, B14, etc.
- Remove Notifications + Approvals from primary sidebar → fold into Inbox
- Remove Components / Style Guide from sidebar (Builder mode only)
- Fix B2 (stale meta), B3 (Extract subtitle), B4 (badge), B5 (Coming
  Soon), B17 (subtitle voice on 4 pages), B11 (skill labels), B12 (run
  labels)
- Add Builder mode toggle in user menu

Outcome: sidebar shorter and calmer, vocabulary consistent, no
page-title bug.

### Phase 2 — Page grammar adoption (2-3 sessions)

Convert every page to PageHeader + PageBody + the right type. Audit:

- Dashboard → Hub type, with stateful greeting + setup checklist
- Chat → Special (not a standard type — chat surface)
- Projects index → Index type
- Spaces index → Index type
- Skills → Index type
- Apps (Connectors) → Catalog type
- Routines → Queue type
- Inbox → Queue type (the unified one)
- Approvals → Queue type (deep-link)
- Activity → Queue type (Builder mode)
- Files → Queue type (with drop zone)
- Settings → Form type
- Admin → Form type
- Organization → Form type
- Extract → Form type or remove

Each page: ~30 min to adopt PageHeader + StatGrid + PageFilters where
applicable. Total: ~10 hours focused work.

### Phase 3 — Templates-first creation (1-2 sessions)

The biggest feature lever for new-user feel:

- Routines: 5 templates + custom (template picker as first step)
- Spaces: 4 templates + custom (Solo / Support / Research / Writer)
- Projects: 4 templates + custom (From a goal / Research / Writing / Code)

Templates are *just* prefilled forms. Backend stays the same.

### Phase 4 — Polish dimension (1 session)

- Motion language locked in (token table in CSS)
- Skeleton parity audit (every page renders matching skeleton)
- Error parity audit (every page renders error state)
- Empty-state illustration set (3 SVGs)
- Microcopy voice pass (every string)
- Live-update dots + last-updated stamps

### Phase 5 — Power layer (1 session)

- Keyboard shortcuts (g h, g i, g c, j/k, n, c, ?)
- Mass actions (select + footer)
- Saved filters in Inbox
- Builder mode disclosures throughout
- Status dot in sidebar org switcher

### Phase 6 — Marketing + trust (1 session)

- Landing two-lane (use it / fork it)
- Real product screenshot above the fold
- Sign-in trust copy
- Stale meta fixed

---

## What we'd hand a designer next

If we were to bring in a senior product designer for a half-day, the
brief would be:

1. Read this doc + GPT-5.5's review.
2. Walk the live app once.
3. Pick three pages and **redesign them in Figma** as the canonical
   reference: Dashboard Home (Hub), Inbox (Queue), Apps (Catalog).
4. Define the **motion language** as a Lottie or video reference.
5. Define **three illustrations** for empty/all-clear/error.
6. Hand back: Figma file + 6-line CSS token addition + motion video.

We then implement against that reference with the primitives from
Phase 0. Total project: ~3 weeks of focused work to reach
"extraordinarily well designed".

---

## Bottom line

The randomness you're feeling is structural drift, and the cure is
**writing the contract down + building the primitives that enforce it**,
not polishing each page individually. GPT-5.5 nailed the IA half of the
diagnosis (Use / Setup / Builder); this doc nails the visual-coherence
half (page grammar + primitives + voice).

After Phase 0 (the contract + primitives), everything else moves fast
because the wrong path is harder than the right path. The starter's
foundation — shadcn + Tailwind v4 + the design token system + the
recent ListRow/Section primitives — is genuinely good. It just needs a
spine.

If you'd like a third opinion to cross-check this synthesis, the natural
next move is to feed both reviews to **Gemini 3 Pro** (deep-IA reasoning
+ different visual training) and **DeepSeek V4** (often spots subtle
copy + mobile issues), and see what they catch that we both missed.
Each is one prompt away in the in-app chat.

---

**Authors**: Claude Opus 4.7 (this doc) + GPT-5.5 (peer review).
**Created**: 2026-04-28.
**Next step (recommended)**: Approve Phase 0 — write the contract + build
the 10 missing primitives. Then Phases 1-6 in order. No code changes
have been made for this review.
