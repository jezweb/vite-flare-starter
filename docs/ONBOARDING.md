# Onboarding

Two audiences, two sequences:

- **Humans** — end-users in a fork's product. What do they see + do
  in the first 5 minutes after sign-up?
- **AI agents** — a future Claude Code session opening this repo (or
  a fork of it). Where to look first; what's already done; what to
  not accidentally rebuild.

---

## For humans (fork-users designing their product's first 5 minutes)

The starter doesn't ship an opinionated onboarding. Your fork picks
the shape based on the product. This section is patterns + checklists
for designing one well.

### What "good first 5 minutes" looks like

A user signed up. They have no agents, no entities, no connections,
no data. They need to see something that:

1. **Demonstrates the agent works** within ~30 seconds (without setup)
2. **Hints at what the product can do** without overwhelming
3. **Lands them on a single concrete action** — "your next step is X"
4. **Captures intent** — what they're here for — to inform later prompts

The trap to avoid: a long settings tour before any value lands. Most
users abandon before they see the agent do anything useful.

### Suggested first-5-minutes patterns by playbook

(See [`AGENT_PLAYBOOKS.md`](./AGENT_PLAYBOOKS.md) for the full playbook
list.)

#### Email triage assistant

```
1. Sign in with Google (better-auth, pre-wired)
2. Connect Gmail (OAuth — connectors module)
3. Welcome page: "Configure your morning brief"
   - Form: triage rules text area (seeded with example)
   - Form: fire time picker (default user's TZ at 8am)
4. Submit → AssistantAgent.scheduleSelfRun() at fire time
5. Optional immediate dry-run button → "Run now (test)" → drafts queue
6. Land on /dashboard/approvals (might be empty until first fire)
```

#### CRM-shape

```
1. Sign in
2. Create or join an organization
3. Tour modal: "Your CRM has Deals, Contacts, Companies"
   - Skip option (links to entity creation)
4. Import path: paste CSV / connect to existing CRM
5. Connect Gmail + Calendar
6. Configure ICP (memory block) + sales rules
7. Land on dashboard with empty deals list + agent intro: "Add your first deal or paste a list"
```

#### Document creation

```
1. Sign in + Connect Google (Drive + Docs)
2. Single page: "Try it now"
   - Text area: "What document do you want?"
   - Submit → agent generates → returns Google Doc URL inline
3. Optional: paste sample of your writing → memory block (deferred,
   can do mid-flow on later docs)
4. Land on chat with first doc visible + suggestions ("Make it
   shorter", "Different tone", "New document")
```

#### Customer support

```
1. Sign in + create org (support team)
2. Invite teammates (email)
3. Connect support tool (webhook URL from Phase B — UI shows the URL +
   secret to paste into Zendesk/Intercom)
4. Upload KB articles (R2 + Vectorize index)
5. Configure tone guide
6. Land on /dashboard/approvals showing draft replies as tickets arrive
```

### Setup vs runtime split

Decide which configuration MUST be done before first agent run vs which
can be deferred:

| Type | Examples | Onboarding sequence |
|---|---|---|
| **Hard prerequisites** (agent cannot work without) | OAuth tokens (Gmail), webhook secret (support tool), at least one entity (deal/issue) | Block the user until done — show a checklist |
| **Soft prerequisites** (agent works degraded) | Tone guide, ICP, voice sample, BYOK keys | Allow skip; agent uses defaults; nudge later via in-app prompts |
| **Discovery** (user learns by trying) | Tools available, schedule cadence, memory block UX | Just show the agent; users learn through use |

### Onboarding checkpoints

Track in user state:

```typescript
interface OnboardingState {
  completedSignup: boolean
  completedConnectorAuth: boolean   // pre-req for the playbook
  completedFirstAgentRun: boolean
  completedFirstApproval: boolean
  completedFirstMemoryEdit: boolean // user understands the "agent learns" concept
}
```

Use these to drive a `<OnboardingChecklist />` widget that surfaces
until the major checkpoints fire. Removes itself when complete.

### Tool catalog visibility

Don't surface every tool to the user. The agent has 60+ — exposing
all of them makes the product feel overwhelming and complicated.

Show the user **outcomes** ("the agent can read your email and draft
replies"), not capabilities ("we have gmail_search, gmail_send,
gmail_reply, gmail_draft, gmail_delete").

A "what can the agent do?" page can list tools by category for power
users, but it's not the onboarding default.

### Sample data vs starter data

For data-heavy products (CRM, Jira), consider seeding sample entities
on signup so the user has something to play with. Caveats:

- Mark them clearly as samples ("Sample Deal — delete when ready")
- One-click "delete all samples" button
- Don't hide them inside the user's real data — separate section or filter

This lets the agent demonstrate triage / sweeps / memory immediately
rather than waiting for the user to populate.

### Empty states

Every dashboard page needs a deliberate empty state, NOT just "no
data." See `src/client/components/EmptyState.tsx` — it accepts an
icon, title, description, tips, and dual CTAs. Use it.

The empty state should:
- Explain what would be HERE if the user had data
- Suggest the next action (with a button, not just text)
- Optionally link to a relevant docs page

### Picking a layout for a new list page

Walk this decision tree before writing JSX (full table in `CLAUDE.md` /
`docs/PRIMITIVES.md`):

- text-dominant queue, scan top-to-bottom → `ListRowGroup` —
  scaffold `_template/IndexPage.tsx`
- find-and-act, 5–30 visual/logo-y items → `Item` grid —
  scaffold `_template/CatalogPage.tsx`
- structured uniform rows, sort/filter/pagination, 50+ → `DataTable` —
  scaffold `_template/TablePage.tsx`

Need a view toggle on the same page (cards ⇄ list)? Use
`useViewPreference('<surface>', '<default>')` from
`@/client/lib/use-view-preference`. SkillsPage is the worked example.

Trends / dashboards / charts? `ChartContainer` from
`@/components/ui/chart` (Recharts under the hood, themed). Don't
import Recharts directly. AgentObservabilityPage is the worked example.

### What to skip until later

Resist putting these in onboarding:

- BYOK credential setup (settings page, not onboarding)
- Org member invitations (post-first-success)
- Detailed agent persona configuration (memory blocks, not onboarding)
- Budget gate setup (sane default; configure when bills happen)
- Approval queue tour (let them discover via the bell badge)

---

## For AI agents (Claude Code in a fork)

You're a Claude Code session opened in this repo or a fork of it.
Read this section to orient quickly + avoid rebuilding things that
already exist.

### Reading order (fastest to slowest payoff)

1. **`CLAUDE.md`** (project root) — already in your context. Tells
   you the tech stack, philosophy, where to find things.
2. **`docs/AGENTS.md`** — full agent architecture. Decision matrix,
   pattern guide, every primitive we have.
3. **`docs/PLATFORM_OBSERVATIONS.md`** — what's universal across
   frameworks (don't reinvent), what diverges (architectural
   choices we made), what we deferred + why.
4. **`docs/AGENT_PLAYBOOKS.md`** — concrete product shapes. If the
   user is building one of these, start from the playbook.
5. **`docs/PATTERNS.md`** — building a CRUD feature, hook, table.
6. **`docs/CHAT_INTERNALS.md`** — chat module deep-dive (only if
   touching the chat module).

For Cloudflare-specific things: `docs/PLATFORM_SERVICES.md`.
For agent toolkit + connector setup: `docs/AGENT_TOOLKIT.md`.

### What's already done (don't rebuild)

| You'd be tempted to build... | We already have |
|---|---|
| Token budget tracking | `tokenBudgetPrepareStep` in `src/server/lib/ai/prepare-step.ts` |
| Tool result truncation | `truncateToolResult` in `src/server/lib/ai/tool-adapter.ts` (auto-applied to every tool result) |
| Conversation history trim | `trimHistoryToTokenBudget` in `src/server/lib/ai/trim-history.ts` (auto-applied in chat route) |
| Per-agent scheduling | Use `agent.schedule()` / `agent.scheduleEvery()` — DON'T extend raw DurableObject |
| Agent state sync to clients | Cloudflare `agents` SDK — `state` setter + WebSocket auto-sync |
| Per-user MCP connections | `getUserMcpTools(env, userId)` — already wired into AutonomousAgent.buildToolset |
| Approval queue | Phase A — `requestApproval` + `executeApproved` + `/api/approvals` |
| Webhook receiver | Phase B — `/api/webhooks/agent/:class/:slug` with HMAC + plain-secret |
| Per-agent run audit | Phase C — `agent_runs` table written automatically |
| Per-agent budget gate | Phase D — `state.dailyBudgetUsd` + `BudgetExceededError` |
| Generic entity store | Phase E — `entities` table + `entity_*` tools |
| Vectorize semantic memory | Phase F — `recallSemantic` hook + `agentRemember` / `agentRecall` |
| Approval notifications + UI | Phase G — auto-notification + `/dashboard/approvals` page |
| Cron-driven entity sweep | Phase H — SweeperAgent worked example |
| Better-auth Organization | Phase I v1 — orgs + members + active-org tracking |
| Tool Search | Phase K — `find_tools(query)` + lazy activation in chat module |
| BYOK credentials | Phase L — `service_credentials` + `getServiceKey` resolution chain |
| Generic data table with sort + pagination | `DataTable` from `@/components/ui/data-table` (TanStack Table integration) |
| Per-surface view-toggle persistence | `useViewPreference` from `@/client/lib/use-view-preference` |
| Themed chart wrappers | `ChartContainer` / `ChartTooltip` from `@/components/ui/chart` (don't import Recharts directly) |

### Pattern conventions

- **DOs**: extend `Agent` from `agents` SDK, never raw `DurableObject`
- **Agent partition keys**: `${userId}:${slug}` — per-user scoping baked in
- **Tool definitions**: one file per domain in `src/server/modules/chat/tools/`, ToolDefinition contract, register in `tools/index.ts` aggregator
- **Routes**: Hono modules under `src/server/modules/<x>/routes.ts`, mounted in `src/server/index.ts`
- **D1 schemas**: Drizzle in `src/server/modules/<x>/db/schema.ts`, migrations in `drizzle/NNNN_*.sql`
- **Always update `drizzle/meta/_journal.json`** when adding migrations — it's the source of truth for the migration runner
- **Static routes before parameterised** in Hono routers (see `~/.claude/rules/hono-route-ordering.md`)
- **Multiple `Set-Cookie` headers** require `headers.append()`, not concatenation
- **Lucide icon imports** must be explicit, not `import * as` (tree-shaking)

### Architectural discipline

- **Don't add backwards compatibility unless production data exists.** This is a starter / pattern library; clean breaks are preferred to legacy aliases.
- **Don't add features beyond what the task requires.** A bug fix doesn't need surrounding cleanup. Three similar lines is better than premature abstraction.
- **Default to writing no comments.** Identifiers explain WHAT; comments explain WHY when non-obvious. Don't reference the current task / fix / callers in comments.
- **Trust internal code + framework guarantees.** Validate at boundaries (user input, external APIs). Don't add error handling for scenarios that can't happen.
- **Use the unified `ToolDefinition` contract.** Server execute + client render in one shape. See `src/shared/agent/tool.ts`.

### Things to ALWAYS check before assuming

| Assumption you might make | Reality |
|---|---|
| "I should add a new DO binding for this" | First check if you can extend an existing AutonomousAgent subclass, OR if it should be a stateless tool |
| "I should add a new top-level route module" | Check if it fits in an existing module's routes.ts first |
| "I need to add this to the AI provider list" | First update `src/shared/config/models.ts` (the catalog) — most additions don't need provider code changes |
| "I need to query Workers AI directly" | Use the `AI` binding through the existing `resolveModel` / `resolveModelForUser` path |
| "I need to add a tool" | Use the existing `ToolDefinition` contract; one file per domain in `chat/tools/`; register in `chat/tools/index.ts` |
| "I should write to a new D1 table" | Check `entities` table first — `type` discriminator + `fields` JSON often does the job without a new table |
| "I need to manage credentials for a new provider" | Add to `SUPPORTED_PROVIDERS` in `src/server/lib/credentials.ts` + `ENV_FALLBACKS` map; UI consumes automatically |

### Things to ALWAYS verify after building

| What you built | What to check |
|---|---|
| New tool | Type-check passes, registered in `chat/tools/index.ts`, available to AssistantAgent if appropriate |
| New AutonomousAgent subclass | Wrangler binding added, migration tag bumped, exported from `src/server/index.ts` |
| New D1 migration | Journal updated, applied local + remote (`pnpm db:migrate:local` + `pnpm db:migrate:remote`) |
| Schema change touching existing data | Migration is forward-only; no destructive ALTER without backfill |
| Route added | Mounted in `src/server/index.ts`, follows static-before-parameterised order |
| Anything affecting the chat surface | Test in deployed environment — type-check + build passing ≠ feature works |

### Common mistakes to avoid

(Documented from past mistakes in this repo + cross-project rules.)

- **Don't extend raw DurableObject** — use `Agent` from `agents` SDK
- **Don't use `@callable` decorator** in worker code — workerd doesn't accept stage-3 decorator syntax (issue #36); use plain methods + DO RPC
- **Don't build new schedule/retry/queue infrastructure** — use SDK's `schedule()`, `scheduleEvery()`, `queue()`, `retry()`
- **Don't write to `dist/client/`** — it's overwritten by `pnpm build`
- **Don't use `.amend` on commits** — create new commits; pre-commit hooks may have failed and amending modifies the wrong commit
- **Don't use `git add .` or `-A`** without checking — sensitive files (.env, credentials) can sneak in
- **Don't mock the database in tests** — use real D1 (see `~/.claude/rules/monday-import-gotchas.md`)
- **Don't sync state mid-stream from `useChat`** — passing reactive `initialMessages` prop wipes in-flight messages; freeze a ref + adopt via `setMessages` only when local empty (see `.claude/rules/chat-usechat-initial-messages.md`)

### Useful commands

```bash
pnpm dev                    # Dev server
pnpm type-check             # Strict TypeScript
pnpm build                  # Production build
npx wrangler deploy         # Deploy to Cloudflare
pnpm db:generate:named "x"  # New Drizzle migration
pnpm db:migrate:local       # Apply migrations locally
pnpm db:migrate:remote      # Apply migrations to production
pnpm models:refresh         # Update AI model catalogue
```

### When deploying

Workflow is type-check → build → deploy → smoke test. Don't skip the
smoke test — `pnpm build` succeeding doesn't mean the worker actually
works. After deploy, curl key routes; if the page returns 500 with
"Context is not finalized," check that `dist/client/index.html` exists
(sometimes a partial build leaves it missing — clean rebuild fixes).

### When you're stuck

The first 6 months of this starter's history is in the git log.
`git log --oneline | head -50` shows the recent work + commit messages
explain WHY each piece was built that way. The phase commits (Phase A
through L) are particularly information-dense.

GH issues #34-40 capture deferred work — read those before deciding
something is missing.

### Updating these docs

When you build something significant, update:

1. `CLAUDE.md` — add a row to the "What each module demonstrates" table
2. `docs/AGENTS.md` — if it's an agent pattern
3. `docs/AGENT_PLAYBOOKS.md` — if it's a new product shape
4. `docs/PLATFORM_OBSERVATIONS.md` — if you adopted a pattern from a new framework, or made an architectural call worth recording
5. **This file** — if it changes the "what's already done" or
   "common mistakes" list

The docs age — keep them current as you go, not as a separate cleanup
session. Future Claude (or future you) reads these on session start.
