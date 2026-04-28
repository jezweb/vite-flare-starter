# AGENTS.md — AI Developer Context

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
| **chat** | ToolLoopAgent, tool calling, reasoning, structured output, usage logging, vision, subagents | `server/lib/ai/agent.ts`, `server/modules/chat/routes.ts` |
| **conversations** | Conversation persistence, ChatStorage interface (D1-backed, DO-ready) | `server/modules/conversations/storage.ts` |
| **files** | R2 upload/download, multipart form handling, metadata in D1 | `server/modules/files/routes.ts` |
| **activity** | Audit logging with pagination, entity history, stats aggregation | `server/modules/activity/routes.ts` |
| **notifications** | In-app service, unread counts, bulk operations | `server/modules/notifications/routes.ts` |
| **api-tokens** | Token generation, SHA-256 hashing, scope-based access | `server/modules/api-tokens/routes.ts` |
| **feature-flags** | DB-backed feature toggles, public/admin endpoints | `server/modules/feature-flags/routes.ts` |
| **organization** | Single-row business settings with upsert | `server/modules/organization/routes.ts` |
| **admin** | User management, role promotion, admin stats | `server/modules/admin/routes.ts` |
| **settings** | Profile CRUD, password, preferences, sessions, data export | `server/modules/settings/routes.ts` |
| **skills** | Codex Agent Skills registry + editor + AI-sparkle rewrite + diff approval | `server/modules/skills/routes.ts` |
| **config-diff** | Shared primitive for staged user-config changes (skills, prompts, …) | `server/modules/config-diff/` |
| **scheduled-agents** | DO scheduled work via agents SDK `schedule()` / `retry()` — no hand-rolled alarms | `server/modules/scheduled-agents/reminder-agent.ts` |
| **autonomous-agents** | Stateful AI agent base — persona + memory blocks + tools + decision loop + approval queue + webhooks + budget gate + run audit. Plus multi-agent handoff (researcher → writer) | `server/lib/agents/autonomous-agent.ts`, `server/modules/autonomous-agents/{assistant,researcher,writer}-agent.ts` |
| **mcp-agents** | Agent-as-MCP-server pattern — exposes app data over MCP for external Codex / clients | `server/modules/mcp-agents/scratchpad-mcp-agent.ts` |
| **approvals** | Human-in-the-loop queue for autonomous agent actions — draft → review → approve → execute | `server/modules/approvals/routes.ts` |
| **webhook-agents** | External event ingestion — HMAC-verified webhook → agent.handleWebhook | `server/lib/agents/webhook-verify.ts`, `server/modules/webhook-agents/routes.ts` |
| **agent-observability** | `agent_runs` audit table + endpoints (cost / runs / errors per agent) | `server/modules/agent-observability/routes.ts` |
| **entities** | Generic typed entity store + CRUD for CRM / Atlassian-style apps + agent tools | `server/modules/entities/`, `server/modules/chat/tools/entities.ts` |
| **agent-memory** | Vectorize-backed semantic recall (opt-in via `AGENT_MEMORY` binding) | `server/lib/agents/agent-memory.ts` |
| **approvals UI** | React tab at /dashboard/approvals — review + approve/reject queued agent actions, deep-link from notifications | `client/modules/approvals/pages/ApprovalsPage.tsx` |
| **sweeper-agent** | Cron-driven entity processing — recurring agent that scans entities for stale items + queues followup approvals | `server/modules/autonomous-agents/sweeper-agent.ts` |
| **organizations** | **Multi-tenant orgs** — better-auth plugin + auto-personal-org on signup + OrgSwitcher in sidebar + `/dashboard/organization` (members + invites + roles) + `/accept-invitation/:token` public flow. Slack/Linear/Notion convention: sidebar shows tenant context, product brand stays on public surfaces. | `server/modules/organizations/`, `client/modules/organizations/`, `docs/orgs-ui-plan-2026-04-28.md` |
| **agent MCP integration** | AutonomousAgent inherits tools from owner's connected MCP servers automatically | `server/lib/agents/autonomous-agent.ts` (buildToolset) |
| **tool-search** | Progressive tool disclosure — agent gets `find_tools(query)` + ~10 core tools, the rest load on demand. ~10K tokens/turn saved | `server/lib/ai/tool-search.ts`, wired in chat agent.ts |
| **routines** | **Canonical recurring agent pattern** — declarative config (agent + schedule + skills + tools allow-list + hooks). Channels-as-tools (notify / approval_queue / inbox_add / space_send / webhook_post). Run-summary tail keeps cost flat over hundreds of fires. | `server/modules/routines/`, `client/modules/routines/`, `docs/ROUTINES.md` |
| **inbox** | Unified review surface for findings + pending approvals. Sort by importance → due → created. Findings emitted by routines via `inbox_add` channel tool. | `server/modules/inbox/`, `client/modules/inbox/pages/InboxPage.tsx` |
| **channels** | Internal MCP-equivalent tools the agent dispatches findings to. Routines opt in via `toolsAllowed`. | `server/modules/chat/tools/channels.ts` |
| **connection profiles** | Per-MCP-connection labels + per-agent allow-list — solves "personal Gmail vs work Gmail" cleanly. Filter applied in `getUserMcpTools(env, userId, agentName)`. | `server/modules/mcp-connections/db/schema.ts`, `client/modules/connectors/components/ConnectionDetail.tsx` (ProfilePanel) |
| **agent metadata + registry** | Every AutonomousAgent declares `static metadata = { displayName, description, category }`. `/api/agents/registered` exposes the catalogue; pickers consume it so users never see raw class names. Add an agent → metadata + import = auto-discovered. | `shared/agent/metadata.ts`, `server/lib/agents/registry.ts`, `server/lib/agents/routes.ts` |
| **format helpers** | Single-source-of-truth translators: `formatAgentClass / formatOutcome / formatTrigger / formatRole / formatImportance / formatCadenceInterval / deriveInstanceName`. Stops snake_case enum strings from leaking into UI. | `shared/format/agent.ts` |
| **routine pickers** | AgentPicker / SkillsPicker / ToolsPicker / SingleSkillPicker — replace raw text inputs in NewRoutinePage with discoverable combobox + multi-select. Tools grouped by category (Gmail / Notion / Channels / Core / etc.). | `client/modules/routines/components/RoutinePickers.tsx` |
| **email providers** | Six pluggable providers (`email-service` / `smtp2go` / `mailgun` / `resend` / `email-routing-send` / `console`), one file each, registry resolves a priority list. `EMAIL_FAILOVER='true'` cascades on error; `EMAIL_PROVIDER_ORDER` overrides priority. | `server/modules/email/providers/` |

---

## Forking This Project

See [FORKING.md](./FORKING.md) for the full guide.

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

AGENTS.md stays thin on purpose — it loads into every session. Deeper
reference lives in `docs/`, loaded only when you need it.

| Want to… | Read |
|---|---|
| **Onboard fresh** (humans OR AI sessions) — fastest orientation | [`docs/ONBOARDING.md`](./docs/ONBOARDING.md) |
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
| Track fork divergence from upstream (forks only) | [`PATCHES.md`](./PATCHES.md) + [`docs/PATCHES-guide.md`](./docs/PATCHES-guide.md) |
| Deploy checklist | [`docs/DEPLOYMENT_CHECKLIST.md`](./docs/DEPLOYMENT_CHECKLIST.md) |
| MCP connectors setup | [`docs/mcp-connectors.md`](./docs/mcp-connectors.md) |
| Project-local rules (auto-loaded by convention) | `.Codex/rules/*.md` |

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
| **Testing** | Vitest 4 + @cloudflare/vitest-pool-workers |

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
| Expose agent's data over MCP | `McpAgent` from `agents/mcp` + `McpServer` from `@modelcontextprotocol/sdk` | `ScratchpadMcpAgent` at `/mcp/scratchpad/<id>` |
| Multi-session AI chat surface | `AIChatAgent` from `agents/chat` | _SDK class — chat module not yet adopted_ |

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

The `~/.Codex/rules/trust-skills-not-elaborate-code.md` user-global
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

16 curated models across 8 providers. Edit `src/shared/config/models.ts`.
Metadata comes from a bundled snapshot of [models.flared.au](https://models.flared.au)
+ [ai.flared.au](https://ai.flared.au). `pnpm models:refresh` to update.

| Source | Models | Keys |
|---|---|---|
| **Workers AI** (free) | Kimi K2.6 (default), Gemma 4 26B, GLM 4.7 Flash, QwQ 32B | none |
| **Anthropic** | Codex Opus 4.6, Sonnet 4.6, Haiku 4.5 | via OpenRouter |
| **OpenAI** | GPT-5.4, GPT-5.4 mini | via OpenRouter |
| **Google** | Gemini 3.1 Pro, Gemini 3 Flash | via OpenRouter |
| **DeepSeek / Qwen / Mistral / xAI / Z.AI** | V3.2 Speciale, 3.6 Plus, Large 3 2512, Grok 4.1 Fast, GLM 5 | via OpenRouter |

One `OPENROUTER_API_KEY` unlocks everything non-Workers-AI. Direct-provider
SDKs (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) remain as
fallbacks if you prefer native routing.

**Chat module features:** streaming, tool calling, reasoning, vision,
structured output, token usage + per-tool telemetry, message editing,
conversation search (FTS5), export (JSON/Markdown), regenerate,
persistence, MCP integration, MCP-UI rendering, sources footer
(Codex.ai-style citation strip), privileged-tool gating, single-retry
tool repair, `propose_patch` tool for staged config edits.

Implementation notes: [`docs/CHAT_INTERNALS.md`](./docs/CHAT_INTERNALS.md).
Tool catalog + adding new tools:
[`docs/AGENT_TOOLKIT.md`](./docs/AGENT_TOOLKIT.md).

---

## Skills System

Codex Agent Skills compatible — same SKILL.md format that works with
Codex, Codex, Hermes, OpenClaw, Cursor, and Aider.

### SKILL.md format

```yaml
---
name: my-skill
description: What this skill does and when to use it (≤1024 chars)
---

# My Skill

Step-by-step instructions the AI follows...
```

Required: `name` (lowercase-hyphens, ≤64 chars), `description` (≤1024 chars).

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

- **OAuth-only by default** — set `ENABLE_EMAIL_LOGIN=true` for
  email/password.
- Google OAuth with optional domain restriction via Google Cloud Console.
- Session management: 7-day expiry, revoke on password change.
- Admin role via `ADMIN_EMAILS` env var.

---

## Deployment

```bash
printf "secret" | npx wrangler secret put BETTER_AUTH_SECRET
printf "https://your-app.workers.dev" | npx wrangler secret put BETTER_AUTH_URL
printf "http://localhost:5173,https://your-app.workers.dev" | npx wrangler secret put TRUSTED_ORIGINS
npx wrangler deploy
```

---

## Commands

```bash
pnpm dev                    # Dev server
pnpm build                  # Production build
npx wrangler deploy         # Deploy to Cloudflare
pnpm db:generate:named "x"  # Generate migration
pnpm db:migrate:local       # Apply migrations locally
pnpm db:migrate:remote      # Apply migrations to production
pnpm models:refresh         # Update AI model catalogue from flared.au
pnpm test                   # Run tests
pnpm type-check             # Type check
```

---

**Created:** 2025-11-29 · **Updated:** 2026-04-28 · **Author:** Jeremy Dawes (Jezweb)
