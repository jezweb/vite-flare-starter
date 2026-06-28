# CLAUDE.md — AI Developer Context

**Project:** Vite Flare Starter
**Version:** 2.3.0
**Purpose:** Pattern library and production-ready starter kit for Cloudflare Workers

---

## Philosophy: Pattern Library, Not a Demo

The modules in this starter are **reference implementations**. When an AI
agent or developer builds a new feature in a fork, they should read the
closest existing module first to learn the patterns for this stack.

**Don't delete modules you don't need.** Disable them via feature flags
instead — the code stays readable as a pattern reference.

```bash
# In .dev.vars — hide modules from the sidebar without deleting code
VITE_FEATURE_CHAT=false
VITE_FEATURE_FILES=false
VITE_FEATURE_ACTIVITY=false
```

### What each module demonstrates

| Module | Teaches | Key files |
|---|---|---|
| **chat** | `ChatAgent extends AIChatAgent` — DO-backed chat per (user, conv) pair. WebSocket transport, SQLite persistence, MCP, Tool Search, skills, memory, projects, telemetry, D1 projection for cross-module reads | `server/modules/chat/chat-agent.ts`, `server/modules/chat/routes.ts` (utility endpoints only) |
| **conversations** | Conversation persistence, ChatStorage interface (D1-backed, DO-ready) | `server/modules/conversations/storage.ts` |
| **files** | R2 upload/download, multipart form handling, metadata in D1 | `server/modules/files/routes.ts` |
| **activity** | Audit logging with pagination, entity history, stats aggregation | `server/modules/activity/routes.ts` |
| **notifications** | In-app service, unread counts, bulk operations | `server/modules/notifications/routes.ts` |
| **api-tokens** | Token generation, SHA-256 hashing, scope-based access | `server/modules/api-tokens/routes.ts` |
| **feature-flags** | DB-backed feature toggles, public/admin endpoints | `server/modules/feature-flags/routes.ts` |
| **organization** | Single-row business settings with upsert | `server/modules/organization/routes.ts` |
| **admin** | User management, role promotion, admin stats | `server/modules/admin/routes.ts` |
| **settings** | Profile CRUD, password, preferences, sessions, data export | `server/modules/settings/routes.ts` |
| **skills** | Claude Agent Skills registry + editor + AI-sparkle rewrite + diff approval | `server/modules/skills/routes.ts` |
| **config-diff** | Shared primitive for staged user-config changes (skills, prompts, …) | `server/modules/config-diff/` |
| **scheduled-agents** | DO scheduled work via agents SDK `schedule()` / `retry()` — no hand-rolled alarms | `server/modules/scheduled-agents/reminder-agent.ts` |
| **autonomous-agents** | Stateful AI agent base — persona + memory blocks + tools + decision loop + approval queue + webhooks + budget gate + run audit. Plus multi-agent handoff (researcher → writer) | `server/lib/agents/autonomous-agent.ts`, `server/modules/autonomous-agents/{assistant,researcher,writer}-agent.ts` |
| **mcp-agents** | Agent-as-MCP-server pattern — exposes app data over MCP for external Claude Code / clients | `server/modules/mcp-agents/scratchpad-mcp-agent.ts` |
| **approvals** | Human-in-the-loop queue for autonomous agent actions — draft → review → approve → execute | `server/modules/approvals/routes.ts` |
| **webhook-agents** | External event ingestion — HMAC-verified webhook → agent.handleWebhook | `server/lib/agents/webhook-verify.ts`, `server/modules/webhook-agents/routes.ts` |
| **agent-observability** | `agent_runs` audit table + endpoints (cost / runs / errors per agent) | `server/modules/agent-observability/routes.ts` |
| **entities** | Generic typed entity store + CRUD for CRM / Atlassian-style apps + agent tools | `server/modules/entities/`, `server/modules/chat/tools/entities.ts` |
| **agent-memory** | Vectorize-backed semantic recall (opt-in via `AGENT_MEMORY` binding) | `server/lib/agents/agent-memory.ts` |
| **approvals UI** | React tab at /dashboard/approvals — review + approve/reject queued agent actions, deep-link from notifications | `client/modules/approvals/pages/ApprovalsPage.tsx` |
| **sweeper-agent** | Cron-driven entity processing — recurring agent that scans entities for stale items + queues followup approvals | `server/modules/autonomous-agents/sweeper-agent.ts` |
| **admin-agent** | **Claude-Code-style platform admin** — chats with the user in `#admin` Space, proposes routines / agents / connections via 14 admin tools (8 routine, 6 awareness). All write actions gated through `requestApproval`. English-to-routine workflow. | `server/modules/autonomous-agents/admin-agent.ts`, `server/modules/admin-tools/`, `client/modules/admin-agent/pages/AdminAgentPage.tsx` |
| **organizations** | **Multi-tenant orgs** — better-auth plugin + auto-personal-org on signup + OrgSwitcher in sidebar + `/dashboard/organization` (members + invites + roles) + `/accept-invitation/:token` public flow. Slack/Linear/Notion convention: sidebar shows tenant context, product brand stays on public surfaces. | `server/modules/organizations/`, `client/modules/organizations/`, `docs/orgs-ui-plan-2026-04-28.md` |
| **agent MCP integration** | AutonomousAgent inherits tools from owner's connected MCP servers automatically | `server/lib/agents/autonomous-agent.ts` (buildToolset) |
| **tool-search** | Progressive tool disclosure — agent gets `find_tools(query)` + ~10 core tools, the rest load on demand. ~10K tokens/turn saved | `server/lib/ai/tool-search.ts`, wired in `chat-agent.ts` |
| **routines** | **Canonical recurring agent pattern** — declarative config (agent + schedule + skills + tools allow-list + hooks). Channels-as-tools (notify / approval_queue / inbox_add / space_send / webhook_post). Run-summary tail keeps cost flat over hundreds of fires. | `server/modules/routines/`, `client/modules/routines/`, `docs/ROUTINES.md` |
| **inbox** | **Single attention surface for AI-emitted items** — findings + approvals merged. Approval rows open inline `ApprovalSheet` (no route bounce). Approvals removed as separate sidebar entry; route preserved at `/dashboard/approvals` for notification deep links. Sort by importance → due → created. Findings emitted by routines via `inbox_add` channel tool. | `server/modules/inbox/`, `client/modules/inbox/pages/InboxPage.tsx`, `client/modules/inbox/components/ApprovalSheet.tsx`, `client/modules/approvals/components/ApprovalCard.tsx` (shared) |
| **channels** | Internal MCP-equivalent tools the agent dispatches findings to. Routines opt in via `toolsAllowed`. | `server/modules/chat/tools/channels.ts` |
| **connection profiles** | Per-MCP-connection labels + per-agent allow-list — solves "personal Gmail vs work Gmail" cleanly. Filter applied in `getUserMcpTools(env, userId, agentName)`. | `server/modules/mcp-connections/db/schema.ts`, `client/modules/connectors/components/ConnectionDetail.tsx` (ProfilePanel) |
| **agent metadata + registry** | Every AutonomousAgent declares `static metadata = { displayName, description, category }`. `/api/agents/registered` exposes the catalogue; pickers consume it so users never see raw class names. Add an agent → metadata + import = auto-discovered. | `shared/agent/metadata.ts`, `server/lib/agents/registry.ts`, `server/lib/agents/routes.ts` |
| **format helpers** | Single-source-of-truth translators: `formatAgentClass / formatOutcome / formatTrigger / formatRole / formatImportance / formatCadenceInterval / deriveInstanceName`. Stops snake_case enum strings from leaking into UI. | `shared/format/agent.ts` |
| **routine pickers** | AgentPicker / SkillsPicker / ToolsPicker / SingleSkillPicker — replace raw text inputs in NewRoutinePage with discoverable combobox + multi-select. Tools grouped by category (Gmail / Notion / Channels / Core / etc.). | `client/modules/routines/components/RoutinePickers.tsx` |
| **email providers** | Six pluggable providers (`email-service` / `smtp2go` / `mailgun` / `resend` / `email-routing-send` / `console`), one file each, registry resolves a priority list. `EMAIL_FAILOVER='true'` cascades on error; `EMAIL_PROVIDER_ORDER` overrides priority. | `server/modules/email/providers/` |
| **batch-tasks** | **Durable swarm fan-out** — Cloudflare Workflow processes N items in parallel windows of 8, retries per-item with exponential backoff. Used via the `start_batch_task` chat tool ("for each of these 50 PDFs, extract X"). Item content is loaded from R2 and converted via `env.AI.toMarkdown` for non-text docs. Approval-gated above 5 items. | `server/modules/batch-tasks/`, `server/modules/chat/tools/batch-task.ts`, `client/modules/jobs/pages/` |
| **with_review** | **Worker→Reviewer quality loop** (OpenSwarm pair-pipeline pattern). Cheap worker drafts → smarter reviewer scores via APPROVE/REVISE/REJECT verdicts → worker rewrites with notes → cap at max_iters with optional escalation. Reviewer criteria from a Skill (`review-output` ships bundled) or inline prompt. Use for high-quality outputs where iteration matters. | `server/modules/chat/tools/with-review.ts`, `skills/review-output/` |
| **always_active skills** | Frontmatter `always_active: true` bakes a skill's full body into every chat's system prompt — bypasses `load_skill`. For baseline knowledge (style, persona, project glossary). Loaded via `loadAlwaysActiveSkills(env, userId)`. | `server/lib/ai/skills/registry.ts`, `server/modules/chat/chat-agent.ts` (section 8b) |
| **hybrid memory recall** | `agentRecall` ranks via `0.55*sim + 0.20*importance + 0.15*recency + 0.10*frequency`. `RECALL_WEIGHTS` exposed as a constant; importance optional on `agentRemember`. Frequency reserved at 0 until Vectorize counter support lands. | `server/lib/agents/agent-memory.ts` |
| **tool-search** (find + list) | `find_tools(query)` keyword-searches with per-token scoring (multi-word queries work); `list_tools(category)` paginates by name prefix (e.g. `gmail_`). Both core tools — always active in chat agent's prepareStep. | `server/lib/ai/tool-search.ts` |
| **knowledge** | Long-form indexed reference docs per scope (user/project/org). FTS5-indexed, two injection modes (`always` bakes body into every prompt, `on_demand` exposes catalog the agent searches via `knowledge_search` + `load_knowledge`). Server-side cap at 50K total always-active tokens. Sits between `memories` (small structured facts) and `skills` (procedures). | `server/modules/knowledge/`, `client/modules/knowledge/`, `server/modules/chat/chat-agent.ts` (section 8c) |
| **voice mode** | Push-to-talk + auto-TTS wrapper around the chat agent. Aura 2 default + ElevenLabs opt-in. iOS Safari unlock via primed audio element, AbortController + 25s timeout, race-safe via session counter. Distinct from VoiceDictationButton (which streams STT into the input field via DO+WS). | `server/modules/voice/`, `client/modules/chat/components/VoiceModeButton.tsx`, `client/modules/chat/hooks/useVoiceChat.ts` |
| **tool-renderer shape tier** | Generic tool-output viewers matched by output shape rather than tool name — auto-upgrades ~30 long-tail tools to rich UX with zero per-tool client code. Shapes: stdout/image/markdown/table. Registered after bespoke renderers, before defaults. `pnpm tool-coverage` audits the registry. | `client/modules/chat/components/tool-renderers/shapes.tsx`, `scripts/tool-coverage.mjs` |
| **access log** | Cross-user activity log for app owners — `GET /api/admin/access-log` (auth+admin gated) over the existing `activity_logs` table, filterable by user/action/entity/date, actor-email enriched. Per-user `/api/activity` shows only your own rows; this answers "what has any user done in this app?". | `server/modules/admin/routes.ts` (access-log route), `client/modules/admin/pages/AccessLogPage.tsx` |
| **security primitives** | Single-source-of-truth guards reused across modules: `scopeUser`/`getOrgRole` (tenancy), `isOwnedR2Key` (R2 ownership), `signValue`/`verifyValue` (signed OAuth-redirect cookies + mcp state), `isSafePublicUrl`/`isAllowedGitHubUrl` (SSRF), `escapeHtml` (reflected-XSS), `bytesToBase64` (large-file safe), fail-closed `AGENT_ACCESS_POLICY` (DO access). Full model: `docs/SECURITY.md`. | `server/lib/{tenancy,r2-keys,crypto,ssrf,escape-html,base64}.ts`, `server/index.ts` |
| **brains-trust pattern** | After non-trivial builds, run a multi-reviewer review via 2-4 frontier models (GPT-5.5 + Opus 4.7 + DeepSeek v4 Pro/Flash) — cross-validated criticals fixed before commit; cross-validated highs before deploy. ~$0.46-$0.81/round. Codified in `~/.claude/CLAUDE.md`. Audit artefacts saved to `.jez/audits/<date>-brains-trust-<topic>.md`. | (process; see `.jez/audits/2026-05-07-tool-ui-and-connectors-brains-trust.md` for a worked example) |

---

## Forking This Project

See [FORKING.md](./FORKING.md) for the full guide.

**Fork, don't clone.** When the user says "fork the starter", create a
real GitHub fork (`gh repo fork ...` or the GitHub UI) so `upstream`
stays wired and `git pull upstream main` keeps you on bug fixes and
security patches. A `git clone` + `rm -rf .git` cuts you off forever —
only do that if the user explicitly asks for a detached snapshot.

**Issues + upstream contributions are welcome.** If your fork hits
friction the starter hasn't solved yet, [`CONTRIBUTING.md`](./CONTRIBUTING.md)
shows the shape of a useful issue (diagnosis + repro + severity + fix
suggestion) and welcomes PRs back. The
[recent fork-build issues](https://github.com/jezweb/vite-flare-starter/issues?q=is%3Aclosed+author%3Aapp%2Fclaude)
are good templates — copy that shape and triage stays under a minute.

**Quick start after forking:**

1. Edit `src/shared/config/nav.ts` — add your product's nav items
2. Edit `src/shared/config/features.ts` — disable modules you don't need
3. Edit `src/shared/config/app.ts` — rebrand (name, logo, token prefix)
4. Create your first module following [`docs/PATTERNS.md`](./docs/PATTERNS.md)

**Rebrand before production:** `VITE_APP_NAME`, `VITE_TOKEN_PREFIX` +
`TOKEN_PREFIX`, `index.html` title, favicon in `public/`. Set
`VITE_GITHUB_URL=""` to hide GitHub links.

---

## Where to find things

CLAUDE.md stays thin on purpose — it loads into every session. Deeper
reference lives in `docs/`, loaded only when you need it.

| Want to… | Read |
|---|---|
| **Onboard fresh** (humans OR AI sessions) — fastest orientation | [`docs/ONBOARDING.md`](./docs/ONBOARDING.md) |
| **Secure a deployment** — access-control model + pre-deploy checklist | [`docs/SECURITY.md`](./docs/SECURITY.md) |
| **Build a specific product** (email triage, CRM, Jira, support, docs) | [`docs/AGENT_PLAYBOOKS.md`](./docs/AGENT_PLAYBOOKS.md) |
| **Architectural rationale** — why the starter looks like this, what we adopted from other frameworks | [`docs/PLATFORM_OBSERVATIONS.md`](./docs/PLATFORM_OBSERVATIONS.md) |
| Build a CRUD feature, table, hook | [`docs/PATTERNS.md`](./docs/PATTERNS.md) |
| **Build a recurring agent** ("watch X, emit findings") | [`docs/ROUTINES.md`](./docs/ROUTINES.md) |
| **Multi-tenant orgs / invite flow / member management** | [`.jez/artifacts/orgs-ui-plan-2026-04-28.md`](./.jez/artifacts/orgs-ui-plan-2026-04-28.md) |
| Build an AI agent / scheduled agent / agent swarm | [`docs/AGENTS.md`](./docs/AGENTS.md) |
| Wire voice, video, or any DO streaming agent | [`docs/DO_AGENTS.md`](./docs/DO_AGENTS.md) |
| Understand sources, gating, NLP, observability | [`docs/CHAT_INTERNALS.md`](./docs/CHAT_INTERNALS.md) |
| Add or customise agent tools + connectors | [`docs/AGENT_TOOLKIT.md`](./docs/AGENT_TOOLKIT.md) |
| Vision + image edit + image gen patterns | [`docs/VISION_AND_IMAGE_EDITING.md`](./docs/VISION_AND_IMAGE_EDITING.md) |
| Enable KV / Queues / Vectorize / Hyperdrive / Stream | [`docs/PLATFORM_SERVICES.md`](./docs/PLATFORM_SERVICES.md) |
| Add analytics / payments / email / real-time / background jobs | `docs/ADDING_*.md` |
| Email inbound (Cloudflare Email Routing) | [`docs/ADDING_EMAIL_INBOUND.md`](./docs/ADDING_EMAIL_INBOUND.md) |
| Track fork divergence from upstream (forks only) | [`PATCHES.md`](./PATCHES.md) + [`docs/PATCHES-guide.md`](./docs/PATCHES-guide.md) |
| Interop with [goanna](https://github.com/jezweb/goanna) — filesystem-markdown agent framework | [`docs/GOANNA_INTEROP.md`](./docs/GOANNA_INTEROP.md) |
| Deploy checklist | [`docs/DEPLOYMENT_CHECKLIST.md`](./docs/DEPLOYMENT_CHECKLIST.md) |
| MCP connectors setup | [`docs/mcp-connectors.md`](./docs/mcp-connectors.md) |
| Project-local rules (auto-loaded by convention) | `.claude/rules/*.md` |

---

## Project Knowledge — `.jez/`

Two knowledge layers in this project, different lifecycles:

| Layer | Path | Lifecycle |
|---|---|---|
| **Stable docs** (curated, every fork reads) | `docs/` | Long-lived, referenced from this file |
| **Working knowledge** (in-flight or recently shipped) | `.jez/` | Dated, evolving |

When a `.jez/` artefact stabilises into something every fork should read, promote it to `docs/` and link it from "Where to find things" above.

### Subfolder map

| Subfolder | Holds | Wiki conventions? |
|---|---|---|
| `artifacts/` | Dated audits, plans, design reviews, sweeps (~60 md files) | **Yes** — frontmatter + `_index.md` warranted |
| `plans/` | In-flight execution plans | Yes when >5 files |
| `ideas/` | Unrealised concepts | Light — frontmatter optional |
| `issues/` | Problems / questions to solve | Light |
| `handoff/` | Cross-session context for the next agent | Yes — README.md is the index |
| `audit-evidence/` | Generated audit data (subfolders by date) | No — artifact storage |
| `screenshots/`, `screenshots-audit/` | Binary captures | No |
| `fixtures/`, `scripts/` | Test fixtures, utility scripts | No |

### Naming for dated artefacts

`<topic>-<YYYY-MM-DD>.md` so chronology is grep-able. Same date in frontmatter for redundancy.

- ✅ `design-review-2026-04-29-final.md`
- ✅ `chat-improvements-plan-2026-04-17.md`
- ❌ `notes.md`

### Recommended frontmatter

```yaml
---
date: 2026-04-22
status: draft | active | complete | superseded
supersedes: design-review-2026-04-29-post-gpt55.md  # if applicable
owner: jez+claude | jez | claude
---
```

The four `design-review-*` files in `artifacts/` are the canonical chain pattern — the latest is `active`, earlier ones are `superseded` with the new file's name in `supersedes:`. The chain stays for audit.

### Shared conventions

Page shapes (frontmatter, Gotchas section, `_index.md` threshold, when-to-subfolder rule) follow the global wiki conventions: see `~/Documents/.jez/CONVENTIONS.md`. This section only documents what's local to this project.

### Pending

`artifacts/_index.md` is past due — 60+ files crossed the threshold. Whoever next does an audit cycle should seed it (Librarian's `~/Documents/.jez/clients/_index.md` is the model: table + cross-cutting flags + last-updated stamp).

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Platform** | Cloudflare Workers with Static Assets |
| **Frontend** | React 19 + Vite 7 |
| **Backend** | Hono 4.12 |
| **Database** | D1 (SQLite) + Drizzle ORM 0.45 |
| **Auth** | better-auth 1.6 (Google OAuth, optional email/password) |
| **AI** | AI SDK v6 + workers-ai-provider + OpenRouter (16 models across 8 providers) |
| **UI** | Tailwind v4 + shadcn/ui |
| **Data fetching** | TanStack Query 5 + apiClient |
| **Forms** | React Hook Form + Zod |
| **Testing** | Vitest 4 + @cloudflare/vitest-pool-workers (unit) · Playwright (e2e killer flows in `tests/e2e/`) |

---

## Config-driven navigation

The sidebar is driven by `src/shared/config/nav.ts`. Edit this file —
don't modify the layout component.

```typescript
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard', label: 'Home', icon: Home },
      { to: '/dashboard/chat', label: 'AI Chat', icon: MessageSquare, feature: 'chat' },
    ],
  },
  {
    label: 'Admin',
    defaultCollapsed: true,
    items: [
      { to: '/dashboard/admin', label: 'Users', icon: Users, minRole: 'admin' },
    ],
  },
]
```

Feature flags in `src/shared/config/features.ts` control item visibility:
`chat`, `files`, `activity`, `notifications`, `apiTokens`, `themePicker`,
`devTools`, `styleGuide`, `components`, `voiceAgent`, `videoAgent`.

---

## UI Patterns

**Pages over modals.** Dedicated pages for forms and content. Modals
only for confirmations and quick decisions. Reference:
`src/client/modules/settings/pages/SettingsPage.tsx`.

### Adding a new page

1. Create the page component in your module
2. Add a Route in `src/client/App.tsx`
3. Add a nav item in `src/shared/config/nav.ts`
4. Feature-flag it if it's optional

### App-level layout: the `AppShell` primitive

All three layouts (`DashboardLayout`, `PublicLayout`, `PublicAppLayout`) are
thin compositions of one primitive: `src/components/ui/app-shell.tsx`. Don't
fork a whole layout file to change shape — compose `AppShell` differently:

```tsx
<AppShell
  sidebar={<AppSidebar />}        // omit → stacked mode (header/main/footer column)
  header={<SiteHeader />}
  footer={<AppFooter />}
  banner={<EmailVerificationBanner />}   // between header and main
  overlays={<><CommandPalette /><KeyboardShortcuts /></>}  // invisible mounts
  contentMaxWidth="full"          // narrow | medium | wide | full
  contentPadding                  // p-4 md:p-6 wrapper (default on)
>
  <Outlet />
</AppShell>
```

- **Sidebar present** → shadcn `SidebarProvider` + responsive collapse + fixed
  full-height shell (main scrolls internally). Right-hand rail: pass
  `<AppSidebar side="right" />` (side is owned by the sidebar element).
- **No sidebar** → plain `min-h-screen` flex column, natural page flow.
- Per-area shapes (`/admin` vs `/portal`): compose a different `AppShell` per
  route group. Per-page width: set `contentMaxWidth` on that route's layout.

### UI components available

| Component | File | What it does |
|---|---|---|
| **Command Palette** | `client/components/CommandPalette.tsx` | Cmd+K global search/navigation |
| **Keyboard Shortcuts** | `client/components/KeyboardShortcuts.tsx` | Press ? to show all shortcuts |
| **Empty State** | `client/components/EmptyState.tsx` | No-data screens with CTA |
| **Inline Edit** | `client/components/InlineEdit.tsx` | Click-to-edit text fields |
| **Skeletons** | `client/components/skeletons.tsx` | StatCard, Table, Chart, List, Page |
| **Notification Bell** | `client/components/NotificationBell.tsx` | Unread count + dropdown |
| **Audio Recorder** | `client/components/AudioRecorder.tsx` | Voice input → Blob (for `transcribe_audio`) |
| **Voice Dictation Button** | `client/modules/chat/components/VoiceDictationButton.tsx` | Streaming STT — iPhone-style live transcript in chat input |
| **Paste Upload** | `client/hooks/usePasteUpload.ts` | Cmd+V file/image handler |
| **ConfigDiffCard** | `client/components/ConfigDiffCard.tsx` | Shared approval card with line diff (used by skills editor + propose_patch chat tool) |
| **MarkdownField** | `client/components/MarkdownField.tsx` | Preview/edit toggle + rich copy (formatted paste) + .md/.txt export for user markdown. Read-only when no `onChange`. |
| **CopyButton (rich)** | `components/ui/copy-button.tsx` | Pass `html=` for formatted clipboard copy (writes text/html + text/plain). `useCopy().copyRich()` for the hook form. |

### Choosing a layout for a list page

Pick the shape that matches what the user is doing on the page, not what
the data looks like. The `_template/` directory has a copy-paste scaffold
for each shape.

| Pattern | When | Primitive | Scaffold |
|---|---|---|---|
| **Card grid** | find-and-act, 5–30 visual/logo-y items | shadcn `Item` + Tailwind grid | `_template/CatalogPage.tsx` |
| **List row** | find-and-act/edit, text-dominant queue | `ListRowGroup` (custom) | `_template/IndexPage.tsx` |
| **Table** | structured uniform rows, sort/filter, 50+ items | shadcn `Data Table` | `_template/TablePage.tsx` |
| **Split-pane** | sequential reading (Inbox, Approvals) | `Resizable` + `ListRow` | none yet — use Inbox as ref |
| **Kanban** (v2) | workflow stages | not yet — extract when 1st use case lands | — |
| **Calendar** (v2) | date-anchored entities | not yet — base on shadcn `Calendar` + custom event renderer | — |

**View toggles** (cards ⇄ list on the same surface): use
`useViewPreference('<surface-key>', '<default>')` — persists per-user
via localStorage scoped to `appConfig.id`. See `SkillsPage` for a
worked example.

**For aggregates / trends / dashboards**: shadcn `Chart` (Recharts under
the hood, themed via `chart-1..5` CSS vars). Don't import Recharts
directly — go through the shadcn wrapper for consistent theming. See
`AgentObservabilityPage` for a worked example with bar + area charts.

**When to add a new layout primitive** (Kanban, Tree, Gallery, …):

- 3+ surfaces in this codebase OR a strong "we're about to build several
  of these" — only then.
- New primitive should be small + focused (one job) following the
  existing primitives' shape, NOT a config-blob component.
- Document the use case + when-to-use in this table when it lands.

This rule comes from `~/.claude/rules/trust-skills-not-elaborate-code.md`
applied to layouts: ship focused primitives, let pages compose them, only
extract a generic component when 3+ pages prove the same shape.

---

## Cloudflare platform features

Bindings already configured in `wrangler.jsonc`:

| Service | Binding | Used by |
|---|---|---|
| D1 | `DB` | All modules |
| R2 | `AVATARS`, `FILES` | Avatars, file uploads |
| R2 | `SKILLS` | Skills registry |
| Workers AI | `AI` | Chat (free tier) |
| Images | `IMAGES` | Image processing module |
| Media | `MEDIA` | Video transforms |

For KV / Queues / Vectorize / Browser Rendering / Cron / Hyperdrive /
Stream / Containers — see [`docs/PLATFORM_SERVICES.md`](./docs/PLATFORM_SERVICES.md).

Durable Objects are already scaffolded (`VoiceInputExample`,
`VideoInputExample`) — enable per-feature via `VITE_FEATURE_VOICE_AGENT`
/ `VITE_FEATURE_VIDEO_AGENT`. Wiring guide:
[`docs/DO_AGENTS.md`](./docs/DO_AGENTS.md).

---

## Agents

Four kinds of agent ship with the starter, all on Cloudflare's `agents`
SDK. **Don't extend raw `DurableObject` — use the SDK base.**

| If you need... | Use | Worked example |
|---|---|---|
| Live mic / camera / WebSocket | `Agent` + `withVoiceInput` mixin | `VoiceInputExample` |
| Scheduled non-AI work | `Agent` directly + `this.schedule()` | `ReminderAgent` |
| Stateful AI agent (persona + memory + tools) | `AutonomousAgent` | `AssistantAgent` |
| Multi-agent handoff (specialist → specialist) | `AutonomousAgent` + inline `delegate_to_X` tool | `ResearcherAgent` → `WriterAgent` |
| Platform-management chat (configure routines / agents / connections via natural language) | `AutonomousAgent` + admin tool catalogue, all writes through `requestApproval` | `AdminAgent` |
| Expose agent's data over MCP | `McpAgent` from `agents/mcp` + `McpServer` from `@modelcontextprotocol/sdk` | `ScratchpadMcpAgent` at `/mcp/scratchpad/<id>` |
| Multi-session AI chat surface | `ChatAgent extends AIChatAgent` from `@cloudflare/ai-chat` | `server/modules/chat/chat-agent.ts` |

Full architecture, decision matrix, naming conventions, and migration
notes: [`docs/AGENTS.md`](./docs/AGENTS.md).

---

## Routines (canonical recurring-agent pattern)

When a fork-user wants "an agent that watches X periodically and surfaces
findings", **don't subclass AutonomousAgent**. Use a Routine.

A Routine is a saved configuration that says: *fire this agent every N
seconds, with these tools allowed, loading these skills, with hooks at
these events.* It runs on the cron sweeper and posts findings into the
unified Inbox.

```
Routine
  ├── target  (agentClass + agentName — uses an existing AutonomousAgent)
  ├── schedule (baseInterval, minInterval, maxInterval, adjustMode)
  ├── input template  (what gets injected each fire)
  ├── tools allowed   (allow-list filter on the agent's toolset)
  ├── skills loaded   (markdown SKILL.md procedures auto-injected as system prompt)
  └── hooks            (skill ids fired on SessionEnd → produce run summary)
```

**Channels = MCP-equivalent tools** that the agent calls to dispatch
findings: `inbox_add`, `notify`, `approval_queue`, `space_send`,
`webhook_post`. No rules engine — the agent reads its skill, decides
where to send, calls the right tool. See
[`docs/ROUTINES.md`](./docs/ROUTINES.md) for the full architecture.

**`scheduled-agents` and `webhook-agents`** stay as the lower-level
primitives (per issue #50 decision C+D). Reach for them when you need
sub-routine timers or to ingest external events into a specific agent.
For the user-facing pattern of "watch X, emit findings", **start with a
Routine**.

The `~/.claude/rules/trust-skills-not-elaborate-code.md` user-global
rule applies: before designing a config DSL or rules engine for an AI
feature, ask whether channels-as-tools + a markdown skill covers it.
The answer is almost always yes.

---

## Self-describing primitives — the metadata pattern

Every primitive that a user picks from a list (agent, tool, skill,
channel) **must self-describe** with a `displayName + description`.
Without this, UIs fall back to raw class names / snake_case ids, and
users have to ask developers what each option means.

| Primitive | Where metadata lives | Discovery endpoint |
|---|---|---|
| **Agents** | `static metadata` on each AutonomousAgent class | `GET /api/agents/registered` |
| **Tools** | `description` on each ToolDefinition (categorised by name prefix) | `GET /api/chat/catalog` |
| **Skills** | YAML frontmatter (`name`, `description`) on each SKILL.md | `GET /api/skills/summary` |

When you add a new agent / tool / skill: declare metadata in code,
the picker UI auto-discovers it. No second config file to maintain.

**Translation layer for enums** lives in `src/shared/format/agent.ts`
(`formatAgentClass`, `formatOutcome`, `formatTrigger`, `formatRole`,
`formatImportance`, `formatCadenceInterval`, `deriveInstanceName`).
Anywhere you'd render a raw enum value, import the formatter — it's
the single source of truth for "what does this string mean to a
human?".

**UX testing rule**: every multi-page feature must pass the
"first-time user" persona — *"sign in, complete the task without
reading source"*. Anywhere you'd say "click Skip", that's a UX bug.

---

## AI Module

18 curated models across 9 providers. Edit `src/shared/config/models.ts`.
Metadata comes from a bundled snapshot of [models.flared.au](https://models.flared.au)
+ [ai.flared.au](https://ai.flared.au). `pnpm models:refresh` to update.

**Cloudflare retires Workers AI models without notice** — run
`pnpm doctor:models` to check every `@cf/...` ID in src/ against
the live catalogue. Re-run after any Workers AI release announcement.

| Source | Models | Keys |
|---|---|---|
| **Workers AI** (free) | Kimi K2.6 (default), Gemma 4 26B, GLM 4.7 Flash, QwQ 32B, GPT-OSS 120b, GPT-OSS 20b | none |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | via OpenRouter |
| **OpenAI** | GPT-5.4, GPT-5.4 mini | via OpenRouter |
| **Google** | Gemini 3.1 Pro, Gemini 3 Flash | via OpenRouter |
| **DeepSeek / Qwen / Mistral / xAI / Z.AI** | V3.2 Speciale, 3.6 Plus, Large 3 2512, Grok 4.1 Fast, GLM 5 | via OpenRouter |

One `OPENROUTER_API_KEY` unlocks everything non-Workers-AI. Direct-provider
SDKs (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) remain as
fallbacks if you prefer native routing.

**Model roles** (`server/lib/ai/roles.ts`, #87): internal AI calls pick a
model by *job*, not a hardcoded id. `resolveModelRole(env, 'composer'|'reasoner')`
returns `{ modelId, thinkingOff }`. **composer** = templated / bounded-structured
work (chat titles, conversation summaries, `/extract`) with thinking forced
off so a reasoning model can't burn a capped output budget thinking and return
empty content; **reasoner** = open-ended work (scheduled tasks) with thinking
on. Retune per fork with `MODEL_ROLE_COMPOSER` / `MODEL_ROLE_REASONER`. Call
sites pass `thinkingOffProviderOptions(role)` (AI SDK) or
`thinkingOffRunOptions(role)` (raw `env.AI.run`). Interactive chat keeps using
the user-selected model + `CHAT_REASONING`.

**Chat module features:** streaming, tool calling, reasoning, vision,
structured output, token usage + per-tool telemetry, message editing,
conversation search (FTS5), export (JSON/Markdown), regenerate,
persistence, MCP integration, MCP-UI rendering, sources footer
(claude.ai-style citation strip), privileged-tool gating, single-retry
tool repair, `propose_patch` tool for staged config edits, multi-word
tokenised tool search via `find_tools` + category browse via
`list_tools`.

**Compositional tools** the agent can reach for via the chat catalog:
- `start_batch_task` — durable swarm fan-out (Cloudflare Workflow);
  process N items in parallel with per-item retry + progress page
- `with_review` — Worker→Reviewer quality loop with structured
  verdicts; reviewer criteria from a Skill or inline prompt
- `propose_patch` — stage a config-diff edit (skill / system prompt
  / setting) for user approval

These compose: a `start_batch_task` could route each item through
`with_review` for "do 50 things, but quality-gate each output" — not
wired today, but the contract supports it.

Implementation notes: [`docs/CHAT_INTERNALS.md`](./docs/CHAT_INTERNALS.md).
Tool catalog + adding new tools:
[`docs/AGENT_TOOLKIT.md`](./docs/AGENT_TOOLKIT.md).

---

## Skills System

Claude Agent Skills compatible — same SKILL.md format that works with
Claude Code, Codex, Hermes, OpenClaw, Cursor, and Aider.

### SKILL.md format

```yaml
---
name: my-skill
description: What this skill does and when to use it (≤1024 chars)
# Optional flags:
always_active: true              # bake the full body into every chat's system prompt
disable_model_invocation: true   # hide from the model catalog (routine-hook only)
---

# My Skill

Step-by-step instructions the AI follows...
```

Required: `name` (lowercase-hyphens, ≤64 chars), `description` (≤1024 chars).

**Optional frontmatter flags:**
- `always_active: true` — body baked into every chat's system prompt; the
  agent applies the skill unconditionally (no `load_skill` call needed).
  Use sparingly for baseline knowledge (style guide, persona, glossary).
  Cost: ~500 tokens per skill per turn.
- `disable_model_invocation: true` — hide from the chat catalog. For
  meta-skills only fired as routine hooks (`reflect`, `route-finding`,
  `librarian-curate`, etc).

The two flags are orthogonal but mutually contradictory at runtime —
`loadAlwaysActiveSkills` excludes any skill that has both set.

**Description discipline:** lead with "Use when…" + concrete trigger
phrases. Anthropic's models tool-select much better against
trigger-first descriptions than generic "this skill does X" copy. See
`skills/code-review/SKILL.md` for a worked example.

### Three storage sources

- **Bundled** — drop `skills/<name>/SKILL.md` in the repo. Vite glob,
  build-time. 12 examples ship with the starter.
- **R2** — `POST /api/skills/upload` with SKILL.md content. Stored in
  the SKILLS R2 bucket.
- **GitHub** — `POST /api/skills/github` with a raw URL or directory URL.
  Cached in R2.

### Progressive disclosure

1. **Level 1** (always loaded): `name` + `description` of every enabled
   skill, injected into system prompt.
2. **Level 2** (on demand): full SKILL.md body, via the `load_skill` tool.
3. **Level 3** (referenced files): skill body mentions other files, agent
   reads via `fs_read`.

### Editor + AI-sparkle rewrite

The `/dashboard/skills` page has a list + detail editor with Source,
Preview, and History tabs. Save goes through the ConfigDiffProposal
primitive — edit a bundled skill and you get a diff preview, approve,
and an R2 override is created that shadows the bundled copy
(source flips from `bundled` to `r2`).

The **AI Sparkle** button opens a popover — pass a natural-language
instruction ("make this shorter", "add Australian context") and the
server calls Kimi K2.6 to rewrite the body. Same approval card flow.

The chat agent has a **`propose_patch` tool** that stages skill edits
from conversation ("make my morning-brief skill shorter"). The proposal
renders as an inline ConfigDiffCard in chat — user approves, the change
applies. Server always captures `before` from live state, so diffs are
never stale.

Config-diff primitive: `src/server/modules/config-diff/` (storage,
routes, apply switch). Shared React component:
`src/client/components/ConfigDiffCard.tsx`.

### Bundled skills

12 reference implementations:

- **Research**: `web-research`, `fact-check`, `summarise-url`
- **Writing**: `draft-email`, `rewrite-for-audience`
- **Documents**: `document-qa`, `extract-structured-data`
- **Self-management**: `morning-brief`, `remember-conversation`, `save-research-doc`
- **Workflows**: `compare-options`, `plan-task`, `code-review`

Fork, modify, add your own.

---

## Auth

**Debugging tip**: if a fork is hitting "OAuth completes but no
session" or any other better-auth-on-Workers symptom, run `pnpm
doctor:auth` before anything else. It checks the seven known
trap-doors (wrangler flags, code patterns, secrets, D1 tables) at
once and prints expected values for the things it can't read
(secret contents, Google Cloud Console redirect URI). ~95% of
fresh-fork auth issues are environmental, not code.

- **OAuth-only by default** — set `ENABLE_EMAIL_LOGIN=true` for
  email/password.
- **Who can sign in is gated IN CODE, not just the Google consent screen.**
  Set `ALLOWED_AUTH_EMAILS` / `ALLOWED_AUTH_DOMAINS` (or `AUTH_ALLOWLIST=true`
  to fail closed) — enforced by `isSignupAllowed` in BOTH
  `databaseHooks.user.create.before` (new signups) AND `session.create.before`
  (every login, so a removed operator is locked out on next sign-in). Unset →
  open signup (public-starter default). The consent screen is defence-in-depth;
  an "External" app otherwise lets any Google account in. See `docs/SECURITY.md`.
- Session management: 7-day expiry, revoke on password change.
- Admin role via `ADMIN_EMAILS` env var — auto-promote requires a **verified**
  email (an unverified email/password account on an admin address can't claim admin).
- **OAuth connectors sign their state cookies.** The connecting `userId` carried
  through a provider redirect (`gws_user`/`msw_user`/`<prefix>_user`) is
  HMAC-signed (`signValue`/`verifyValue`, `src/server/lib/crypto.ts`) and verified
  in the callback, so an attacker can't substitute a victim's id to hijack their
  token row. `mcp-connections` binds OAuth `state = signValue(connectionId)`.
- **last-login-method** — better-auth plugin drops a
  `better-auth.last_used_login_method` cookie after each successful
  sign-in. The login page reads it client-side and surfaces a "Last
  used" badge so returning users skip straight to their preferred
  provider. Pure UX nicety — cookie-only, no DB migration.

### Tenancy mode (per-user vs shared)

Rows are scoped to their creator (`userId`) by default. A single-tenant /
small-team fork can flip the whole app to **shared** scoping with
`VITE_TENANCY_MODE=shared` — colleagues then see and act on the same records.

Use the `scopeUser(table.userId, userId)` helper
(`src/server/lib/tenancy.ts`) anywhere you'd write `eq(table.userId, userId)`,
in reads **and** write guards — it returns the condition in per-user mode and
`undefined` (no filter) in shared mode, so the two never drift. Filter it out
of `and(...)` arrays with `isCondition`. The `entities` module is the
fully-converted reference; extend the helper to your own domain modules. Rows
still record their creator either way. Pairs with the allowlist auth gate.

### Test-auth (headless agent login)

**Never reassign real user data to a test user** — every user-scoped table
cascade-deletes, so the next test-auth cleanup wipes the real rows. Clone
rows or use a real OAuth login instead. Full rule: `docs/test-auth-cascade-delete.md`.

When `TEST_AUTH_TOKEN` is set as a wrangler secret, better-auth's
`testUtils()` plugin loads and `/api/test-auth/*` exposes a thin HTTP
wrapper for headless agents. Without the env var, the plugin isn't
loaded and every endpoint returns 404.

```bash
# Mint cookies for a test user (creates if needed)
curl -X POST $URL/api/test-auth/cookies \
  -H "X-Test-Auth: $TEST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "email": "alice@test.vite-flare.local", "name": "Alice" }'
# → { user, cookies: [{ name, value, domain, path, httpOnly, ... }] }
#   cookies are Playwright/Puppeteer-compatible

# Tear down — delete every test-domain user
curl -X POST $URL/api/test-auth/cleanup -H "X-Test-Auth: $TEST_AUTH_TOKEN"
```

Test agents can mint different sessions per call (different email =
different user). The email pattern is locked to `*@test.<anything>.local`
so the endpoint can never accidentally take over a real account. The
secret is constant-time compared.

To enable in your fork:

```bash
printf "$(openssl rand -hex 32)" | npx wrangler secret put TEST_AUTH_TOKEN
```

⚠️ **Cascade-delete trap — never reassign real data to a test user.**
Every user-scoped table cascades on `user.id` delete. If you `UPDATE
entities SET user_id = '<test_user_id>'` so a test session can see
real rows, the next `/api/test-auth/cleanup` call wipes them. Use one
of: (a) verify with direct D1 queries instead of reassigning, (b)
clone rows (`INSERT … SELECT … FROM … WHERE user_id = '<real_user>'`)
and test against the clones, or (c) put your real email in
`ALLOWED_AUTH_EMAILS` and OAuth-sign-in. Full incident + safe-pattern
details in the `test-auth/routes.ts` module docstring.

Lower-level details: `src/server/modules/test-auth/routes.ts` (module
docstring covers the security model + cascade trap).

---

## Deployment

```bash
printf "secret" | npx wrangler secret put BETTER_AUTH_SECRET
printf "https://your-app.workers.dev" | npx wrangler secret put BETTER_AUTH_URL
printf "http://localhost:5173,https://your-app.workers.dev" | npx wrangler secret put TRUSTED_ORIGINS
pnpm run deploy
```

---

## Commands

```bash
pnpm dev                    # Dev server
pnpm build                  # Production build
pnpm run deploy             # Build + deploy to Cloudflare. Use `pnpm run deploy`, NOT bare `pnpm deploy` (that's a pnpm workspace built-in). Direct `npx wrangler deploy` skips the build and ships stale dist.
pnpm db:generate:named "x"  # Generate migration
pnpm db:migrate:local       # Apply migrations locally
pnpm db:migrate:remote      # Apply migrations to production
pnpm models:refresh         # Update AI model catalogue from flared.au
pnpm doctor:auth            # Diagnose better-auth setup — run before debugging "OAuth completes, no session". Read-only checks for wrangler flags, code patterns, secrets, D1 tables; prints manual-verification block for things we can't read (secret values, Google Cloud Console redirect URI).
pnpm doctor:models          # Scan src/ for @cf/ Workers AI model IDs and compare against the live Cloudflare catalogue (via ai.flared.au). Catches deprecations before they 404 in production. Run after a Workers AI release blog post or any "models retired" announcement.
pnpm test                   # Run unit tests (Vitest, runs in Workers pool)
pnpm test:e2e               # Run Playwright killer-flow tests (live deploy by default)
pnpm type-check             # Type check
```

---

**Created:** 2025-11-29 · **Updated:** 2026-06-23 (security review: allowlist, signed connector cookies, access log, tenancy/R2 guards — see `docs/SECURITY.md`) · **Author:** Jeremy Dawes (Jezweb)
