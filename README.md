# Vite Flare Starter

Production-ready AI agent starter kit for Cloudflare Workers. 53+ tools, skills system, conversation persistence, and full AI SDK v6 patterns.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jezweb/vite-flare-starter)

**[Live Demo](https://vite-flare-starter.webfonts.workers.dev)** | **[Documentation](./CLAUDE.md)** | **[Forking Guide](./FORKING.md)**

---

## What's Included

### AI Agent Layer
- **ToolLoopAgent** pattern (AI SDK v6) with `createAgentUIStreamResponse`
- **53+ tools** across 15 modules: browser, search, memory, files, code execution, UI, audio, scheduling, delegation
- **Skills system** (Claude Agent Skills compatible) with bundled + R2 + GitHub sources
- **Conversation persistence** with D1 storage and conversation sidebar
- **Subagent delegation** with role-based tool assignment (researchers get search, coders get code tools)
- **Human-in-the-loop** via `needsApproval` on destructive tools
- **Token budget tracking** via `prepareStep` loop control
- **Multi-provider** AI via factory pattern (Workers AI, Anthropic, OpenAI, Google, OpenRouter)
- **MCP integration** (full spec: tools, resources, prompts, elicitation) + MCP-UI rendering

### Application Framework
- **Authentication** — better-auth with Google OAuth (email/password optional)
- **Admin system** — role-based access (user/manager/admin) with ADMIN_EMAILS auto-promotion
- **Config-driven sidebar** — add nav items in `nav.ts`, feature-flag modules via `features.ts`
- **UI library** — Tailwind v4 + shadcn/ui, 8+ themes, dark/light/system mode
- **Command palette** — Cmd+K search/navigation, keyboard shortcuts
- **File management** — R2 upload/download with metadata in D1
- **Activity logging** — audit trail with pagination and entity history
- **Notifications** — in-app notifications with unread counts
- **API tokens** — SHA-256 hashed, scope-based access control
- **Feature flags** — DB-backed toggles with admin API

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Platform** | Cloudflare Workers with Static Assets |
| **Frontend** | React 19 + Vite 7 |
| **Backend** | Hono 4.12 |
| **Database** | D1 (SQLite) + Drizzle ORM 0.45 |
| **Auth** | better-auth 1.6 (Google OAuth, optional email/password) |
| **AI** | AI SDK v6 + workers-ai-provider (16 Workers AI models) |
| **UI** | Tailwind v4 + shadcn/ui |
| **Data Fetching** | TanStack Query 5 + apiClient |
| **Forms** | React Hook Form + Zod |
| **Testing** | Vitest 4 + @cloudflare/vitest-pool-workers |

## Quick Start

```bash
# Clone and install
git clone https://github.com/jezweb/vite-flare-starter.git my-app
cd my-app
pnpm install

# Create Cloudflare resources
pnpm cf:login
npx wrangler d1 create my-app-db       # Copy database_id to wrangler.jsonc
npx wrangler r2 bucket create my-app-avatars

# Configure
cp .dev.vars.example .dev.vars
# Edit .dev.vars: BETTER_AUTH_SECRET, BETTER_AUTH_URL, Google OAuth creds

# Database
pnpm db:migrate:local

# Run
pnpm dev
```

## Agent Toolkit

Tools are in `src/server/modules/chat/tools/` and auto-included based on available env bindings.

| Module | Tools | Requires |
|--------|-------|----------|
| **core** | `get_server_time`, `get_model_info`, `calculate` | Always |
| **memory** | `remember`, `recall`, `search_memory`, `forget` | Always |
| **ui** | 12 inline UI components (choices, alerts, forms, tables, timelines...) | Always |
| **skills** | `load_skill`, `create_skill`, `install_skill`, `toggle_skill` | Always |
| **code** | `run_python`, `run_shell`, `run_js` | SANDBOX binding |
| **delegate** | `delegate` (ToolLoopAgent subagent with role-based tools) | Always |
| **audio** | `transcribe_audio`, `speak_text` | Always |
| **todo** | `todo_add`, `todo_update`, `todo_list`, `todo_clear` | Always |
| **schedule** | `schedule_task`, `list_tasks`, `cancel_task` | Always |
| **session** | `session_stats`, `search_memories`, `list_all_memories` | Always |
| **browser** | `browser_markdown`, `browser_extract`, `browser_screenshot`, `browser_links`, `browser_content` | CF API token |
| **search** | `web_search` | Search provider key |
| **files** | `fs_list`, `fs_read`, `fs_write`, `fs_delete` | FILES R2 bucket |
| **artifacts** | `create_artifact`, `edit_artifact` | Always |
| **documents** | `generate_docx`, `generate_csv` | Always |

## Skills System

Claude Agent Skills compatible (SKILL.md format). 14 bundled skills covering research, writing, documents, workflows, and self-management.

```
skills/
  web-research/SKILL.md
  draft-email/SKILL.md
  code-review/SKILL.md
  ...
```

Skills from R2 or GitHub can be installed at runtime via the `install_skill` tool or REST API.

## Conversation Persistence

Chats are persisted to D1 via a `ChatStorage` interface (designed for future swap to Durable Objects).

- Conversation sidebar with create/delete/rename
- URL-based routing (`/dashboard/chat/:conversationId`)
- Auto-title from first user message
- Messages saved on stream completion via `onFinish`

## Multi-Provider AI

Pass any model string to `resolveModel()` — the factory picks the right provider:

```typescript
resolveModel(env, '@cf/moonshotai/kimi-k2.5')      // Workers AI (free)
resolveModel(env, 'claude-sonnet-4-6')               // Anthropic
resolveModel(env, 'gpt-4o')                          // OpenAI
resolveModel(env, 'gemini-2.5-pro')                  // Google
resolveModel(env, 'openrouter/anthropic/claude-...')  // OpenRouter
```

16 curated Workers AI models ship with the starter. Set provider API keys as env vars to unlock external models.

## Deployment

```bash
# Set secrets
printf "secret" | npx wrangler secret put BETTER_AUTH_SECRET
printf "https://your-app.workers.dev" | npx wrangler secret put BETTER_AUTH_URL
printf "http://localhost:5173,https://your-app.workers.dev" | npx wrangler secret put TRUSTED_ORIGINS

# Apply migrations + deploy
pnpm db:migrate:remote
npx wrangler deploy
```

## Commands

```bash
pnpm dev                    # Start development server
pnpm build                  # Build for production
npx wrangler deploy         # Deploy to Cloudflare
pnpm db:generate:named "x"  # Generate migration
pnpm db:migrate:local       # Apply migrations locally
pnpm db:migrate:remote      # Apply migrations to production
pnpm test                   # Run tests
pnpm type-check             # TypeScript check
```

## Documentation

- **[CLAUDE.md](./CLAUDE.md)** — Full developer context: patterns, architecture, how to build features
- **[FORKING.md](./FORKING.md)** — Step-by-step guide for forking and customising

## License

MIT - see [LICENSE](./LICENSE)
