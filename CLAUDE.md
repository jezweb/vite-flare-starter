# CLAUDE.md — AI Developer Context

**Project:** Vite Flare Starter
**Version:** 2.1.0
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
| **skills** | Claude Agent Skills registry + editor + AI-sparkle rewrite + diff approval | `server/modules/skills/routes.ts` |
| **config-diff** | Shared primitive for staged user-config changes (skills, prompts, …) | `server/modules/config-diff/` |

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

CLAUDE.md stays thin on purpose — it loads into every session. Deeper
reference lives in `docs/`, loaded only when you need it.

| Want to… | Read |
|---|---|
| Build a CRUD feature, table, hook | [`docs/PATTERNS.md`](./docs/PATTERNS.md) |
| Wire voice, video, or any DO agent | [`docs/DO_AGENTS.md`](./docs/DO_AGENTS.md) |
| Understand sources, gating, NLP, observability | [`docs/CHAT_INTERNALS.md`](./docs/CHAT_INTERNALS.md) |
| Add or customise agent tools + connectors | [`docs/AGENT_TOOLKIT.md`](./docs/AGENT_TOOLKIT.md) |
| Enable KV / Queues / Vectorize / Hyperdrive / Stream | [`docs/PLATFORM_SERVICES.md`](./docs/PLATFORM_SERVICES.md) |
| Add analytics / payments / email / real-time / background jobs | `docs/ADDING_*.md` |
| Track fork divergence from upstream (forks only) | [`PATCHES.md`](./PATCHES.md) + [`docs/PATCHES-guide.md`](./docs/PATCHES-guide.md) |
| Deploy checklist | [`docs/DEPLOYMENT_CHECKLIST.md`](./docs/DEPLOYMENT_CHECKLIST.md) |
| MCP connectors setup | [`docs/mcp-connectors.md`](./docs/mcp-connectors.md) |
| Project-local rules (auto-loaded by convention) | `.claude/rules/*.md` |

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

## AI Module

16 curated models across 8 providers. Edit `src/shared/config/models.ts`.
Metadata comes from a bundled snapshot of [models.flared.au](https://models.flared.au)
+ [ai.flared.au](https://ai.flared.au). `pnpm models:refresh` to update.

| Source | Models | Keys |
|---|---|---|
| **Workers AI** (free) | Kimi K2.6 (default), Gemma 4 26B, GLM 4.7 Flash, QwQ 32B | none |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | via OpenRouter |
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
(claude.ai-style citation strip), privileged-tool gating, single-retry
tool repair, `propose_patch` tool for staged config edits.

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

**Created:** 2025-11-29 · **Updated:** 2026-04-24 · **Author:** Jeremy Dawes (Jezweb)
