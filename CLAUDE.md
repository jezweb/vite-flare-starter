# CLAUDE.md - AI Developer Context

**Project:** Vite Flare Starter
**Version:** 0.15.0
**Purpose:** Production-ready authenticated starter kit for Cloudflare Workers with AI SDK

---

## Forking This Project

**If you're an AI coding agent or developer forking this project:**

Read [FORKING.md](./FORKING.md) first! It provides step-by-step instructions to:
1. Create your own Cloudflare resources (D1, R2 buckets)
2. Update configuration files
3. Remove all framework fingerprints
4. Deploy to production

---

## Security: Rebranding for Production

**IMPORTANT**: Before deploying to production, rebrand to hide framework identity.

Default values can allow attackers to identify your site uses this starter kit.

### Required Environment Variables

```bash
# Client-side (VITE_ prefix)
VITE_APP_NAME=Your App Name        # Shown in UI, headers, sidebar
VITE_APP_ID=yourapp                # Used for localStorage keys, Sentry
VITE_TOKEN_PREFIX=yap_             # API token prefix (3-4 chars + _)
VITE_GITHUB_URL=                   # Empty to hide GitHub links
VITE_FOOTER_TEXT=© 2025 Your Co    # Custom footer

# Server-side (Cloudflare secrets)
TOKEN_PREFIX=yap_                  # Must match VITE_TOKEN_PREFIX
```

### Also Update

1. **`index.html`** - `<title>` and `<meta>` tags
2. **Favicon** - Replace with your own

### What Gets Fingerprinted (if not changed)

| Location | Default Value | Risk |
|----------|---------------|------|
| Page title/meta | "Vite Flare Starter" | Public |
| API tokens | `vfs_` prefix | Network |
| localStorage | `vite-flare-starter-theme` | DevTools |
| Sentry release | `vite-flare-starter@x.x.x` | Network |
| Landing page | GitHub links | Public |

See `src/shared/config/app.ts` for full configuration options.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Platform** | Cloudflare Workers with Static Assets |
| **Frontend** | React 19 + Vite 7 |
| **Backend** | Hono 4.12 |
| **Database** | D1 (SQLite) + Drizzle ORM 0.45 |
| **Auth** | better-auth 1.6 |
| **AI** | AI SDK v6 + workers-ai-provider (native Workers AI binding) |
| **UI** | Tailwind v4 + shadcn/ui |
| **Data Fetching** | TanStack Query 5 |
| **Forms** | React Hook Form + Zod |

---

## UI Patterns

### Pages Over Modals (STRONG PREFERENCE)

**Use dedicated pages instead of modals/dialogs** for most forms and content:

| Use Pages For | Use Modals Only For |
|---------------|---------------------|
| Create/edit forms | Quick confirmations ("Delete?") |
| Multi-step flows | Simple yes/no decisions |
| Data entry | Contextual tooltips/popovers |
| Settings sections | Keyboard shortcut overlays |
| Search/filter views | Loading states |

**Page pattern**: See `src/client/modules/settings/pages/SettingsPage.tsx` for standard layout.

**When asked to "add a form" or "create X"** -> Default to a new page route, not a modal.

---

## Project Structure

```
vite-flare-starter/
├── src/
│   ├── client/              # Frontend (React SPA)
│   │   ├── components/ui/   # shadcn/ui components
│   │   ├── layouts/         # DashboardLayout
│   │   ├── modules/
│   │   │   ├── auth/        # Sign-in/sign-up pages
│   │   │   ├── settings/    # Profile, password, theme
│   │   │   ├── api-tokens/  # API token management
│   │   │   ├── files/       # File management
│   │   │   ├── chat/        # AI chat, extract, model selector
│   │   │   ├── admin/       # Admin dashboard
│   │   │   ├── activity/    # Activity log
│   │   │   ├── notifications/ # In-app notifications
│   │   │   └── organization/# Org settings (timezone, etc.)
│   │   ├── pages/           # Route pages
│   │   └── lib/
│   │       ├── auth.ts           # Auth client (better-auth)
│   │       ├── api-client.ts     # Centralised fetch wrapper
│   │       ├── query-keys.ts     # TanStack Query key factory
│   │       ├── rpc.ts            # Hono RPC typed client
│   │       └── utils.ts
│   ├── server/              # Backend (Hono API)
│   │   ├── index.ts         # Main app + routes
│   │   ├── modules/
│   │   │   ├── auth/        # better-auth config
│   │   │   ├── settings/    # Settings API
│   │   │   ├── api-tokens/  # Token management
│   │   │   ├── files/       # File upload/management
│   │   │   ├── organization/# Org settings API
│   │   │   ├── activity/    # Activity logging
│   │   │   ├── feature-flags/# DB-backed feature flags
│   │   │   ├── notifications/# In-app notifications
│   │   │   ├── chat/        # AI chat, extract, tools, usage logging
│   │   │   └── admin/       # Admin routes
│   │   ├── lib/
│   │   │   ├── logger.ts    # JSON structured logging
│   │   │   ├── csv.ts       # CSV export utilities
│   │   │   └── ai/          # Model registry + middleware
│   │   ├── middleware/
│   │   │   ├── auth.ts      # Session/API token auth
│   │   │   ├── admin.ts     # Admin role protection
│   │   │   ├── security.ts  # CSP, X-Frame-Options
│   │   │   ├── rate-limit.ts# Rate limiting
│   │   │   └── request-id.ts# Request ID tracking
│   │   └── db/schema.ts     # Central schema exports
│   └── shared/
│       ├── schemas/         # Zod validation schemas
│       ├── api-scopes.ts    # API token scope definitions
│       └── config/
│           ├── features.ts  # Feature flags
│           ├── app.ts       # App branding config
│           └── constants.ts # Shared constants (limits, timeouts)
├── drizzle/                 # Database migrations
├── wrangler.jsonc           # Workers config
├── vite.config.ts           # Vite config
└── vitest.config.ts         # Vitest 4 config (cloudflareTest plugin)
```

---

## Key Files

### API Routes
`src/server/index.ts` + module routes:
- `/api/health` - Health check with DB/R2 status and version
- `/api/auth/*` - better-auth handlers (OAuth, password reset)
- `/api/auth/config` - Returns enabled auth methods for UI
- `/api/settings/*` - User settings (profile, email, password, avatar, preferences)
- `/api/settings/sessions` - Session management (list, revoke)
- `/api/api-tokens/*` - API token CRUD
- `/api/organization/*` - Organization settings
- `/api/avatar/:userId` - Avatar serving from R2
- `/api/activity/*` - Activity logging (list, entity history, stats)
- `/api/features` - Public feature flags (no auth)
- `/api/admin/*` - Admin user management, feature flag admin
- `/api/notifications/*` - User notifications (list, mark read, delete)
- `/api/chat` - **AI SDK streaming chat** (POST, AI SDK UIMessage protocol)
- `/api/chat/complete` - Non-streaming chat (POST, JSON response)
- `/api/chat/usage` - Token usage stats for authenticated user (GET)
- `/api/chat/extract` - **Structured data extraction** (POST, Zod schema output)
- `/api/files/*` - File management (upload, list, download, delete)
- `/api/ai/models` - List available Workers AI models (GET)
- `/api/ai/test` - Test AI text generation (POST)

### Database Schema
`src/server/db/schema.ts` - Exports all tables:
- `user`, `session`, `account`, `verification` (auth) - user has `role` field
- `apiTokens` (API key management)
- `files` (user file uploads, metadata in D1, content in R2)
- `organizationSettings` (business settings)
- `activityLogs` (audit trail)
- `featureFlags` (DB-backed feature toggles)
- `userNotifications` (in-app notifications)
- `aiUsageLogs` (token usage tracking per chat request)

### Auth Configuration
`src/server/modules/auth/index.ts`:
- **OAuth-only by default** - email/password is disabled
- Google OAuth (optional, domain restriction via Google Cloud Console)
- Session management (7-day expiry, other sessions revoked on password change)
- `/api/auth/config` endpoint - returns enabled auth methods for UI

| Env Var | Effect |
|---------|--------|
| `ENABLE_EMAIL_LOGIN=true` | Enable email/password authentication |
| `ENABLE_EMAIL_SIGNUP=true` | Also allow new email signups |

---

## AI Module (AI SDK v6)

The AI module uses **Vercel AI SDK v6** with `workers-ai-provider` for native Cloudflare Workers AI binding access. All models are free (no API keys needed).

### Architecture

```
Client (useChat)  -->  POST /api/chat  -->  streamText()  -->  Workers AI
  @ai-sdk/react        Hono route           ai package        env.AI binding
  DefaultChatTransport  toUIMessageStream    workers-ai-provider
```

### Key Files

| File | Purpose |
|------|---------|
| `src/server/modules/chat/routes.ts` | Chat, extract, usage API routes |
| `src/server/modules/chat/tools.ts` | AI SDK tool definitions (get_server_time, get_model_info, calculate) |
| `src/server/modules/chat/db/schema.ts` | aiUsageLogs D1 table |
| `src/server/lib/ai/models.ts` | Workers AI model registry with capabilities |
| `src/server/lib/ai/middleware.ts` | extractReasoningMiddleware wrapper |
| `src/server/lib/ai/types.ts` | ModelConfig, ModelId, ModelTier types |
| `src/client/modules/chat/hooks/useChat.ts` | AI SDK useChat wrapper |
| `src/client/modules/chat/components/ChatMessage.tsx` | Renders text, reasoning, tool parts |

### Features

- **Streaming chat** via `streamText()` + `toUIMessageStreamResponse()` + `useChat()`
- **Tool calling** with 3 demo tools, conditionally active per model capability
- **Reasoning middleware** extracts `<think>` tokens for QwQ 32B, Nemotron 3, Gemma 4
- **Token usage logging** to D1 via `onFinish` callback
- **Smooth streaming** via `smoothStream({ chunking: 'word' })`
- **Message metadata** streams model name, token usage, duration to the UI
- **Vision support** with image attachments for multimodal models (Kimi K2.5, Llama 4 Scout, Gemma 4)
- **Structured output** via `generateText()` + `Output.object()` with Zod schemas
- **Regenerate** button on last assistant message

### Model Registry

16 curated Workers AI models in `src/server/lib/ai/models.ts`:

| Tier | Models | Capabilities |
|------|--------|-------------|
| **Flagship** | Kimi K2.5 (default), Nemotron 3 120B, GPT-OSS 120B, Llama 3.3 70B | Tools, vision, reasoning |
| **Balanced** | Gemma 4 26B, Llama 4 Scout, GLM 4.7, Mistral Small 3.1, Qwen 3 30B | Tools, vision |
| **Fast** | Llama 3.1 8B, GPT-OSS 20B, Granite 4.0, Llama 3.2 3B | Low latency |
| **Reasoning** | QwQ 32B | Step-by-step thinking |

### Adding AI Features

**Add a new tool:**
```typescript
// src/server/modules/chat/tools.ts
import { tool } from 'ai'
import { z } from 'zod'

export const chatTools = {
  // ... existing tools
  your_tool: tool({
    description: 'What this tool does',
    inputSchema: z.object({ param: z.string() }),
    execute: async ({ param }) => ({ result: param }),
  }),
}
```

**Use structured output:**
```typescript
import { generateText, Output } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'

const workersai = createWorkersAI({ binding: c.env.AI })
const { output } = await generateText({
  model: workersai('@cf/moonshotai/kimi-k2.5'),
  output: Output.object({
    schema: z.object({
      title: z.string(),
      summary: z.string(),
    }),
  }),
  prompt: 'Summarise this text...',
})
```

**Use the chat hook with model selection:**
```typescript
import { useChat } from '@/client/modules/chat/hooks/useChat'

const { messages, sendMessage, isLoading, stop } = useChat({
  model: '@cf/moonshotai/kimi-k2.5',
})

// Send text
sendMessage({ text: 'Hello' })

// Send with image (vision models only)
sendMessage({ text: 'What is this?', files: [filePart] })
```

### MCP Integration (Ready)

The AI SDK supports MCP clients via `@ai-sdk/mcp`. To connect MCP tools:

```typescript
import { createMCPClient } from '@ai-sdk/mcp'
import { streamText } from 'ai'

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://your-mcp-server/mcp' },
})
const mcpTools = await mcp.tools()

const result = streamText({
  model: workersai(modelId),
  tools: { ...chatTools, ...mcpTools },
  // ...
})
```

---

## TanStack Query Patterns

### Query Key Factory

Use `src/client/lib/query-keys.ts` for consistent cache keys:

```typescript
import { queryKeys } from '@/client/lib/query-keys'

// In hooks
useQuery({ queryKey: queryKeys.settings.preferences(), ... })
queryClient.invalidateQueries({ queryKey: queryKeys.session })
```

### API Client

Use `src/client/lib/api-client.ts` instead of raw `fetch`:

```typescript
import { apiClient } from '@/client/lib/api-client'

// Handles credentials, headers, error extraction
const data = await apiClient.get<ResponseType>('/api/endpoint')
await apiClient.post<ResponseType>('/api/endpoint', body)
```

---

## Deployment Gotchas

**CRITICAL: When deploying to a new domain:**

1. **Set `TRUSTED_ORIGINS`** to include your production domain(s):
   ```bash
   printf "http://localhost:5173,https://your-domain.workers.dev" | npx wrangler secret put TRUSTED_ORIGINS
   ```
   Without this, auth will silently fail and redirect to homepage.

2. **Set `BETTER_AUTH_URL` secret** to exact production URL:
   ```bash
   printf "https://your-domain.workers.dev" | npx wrangler secret put BETTER_AUTH_URL
   ```

3. **Google OAuth redirect URI** must be registered in Google Cloud Console:
   ```
   https://your-domain.workers.dev/api/auth/callback/google
   ```

**Symptoms of misconfiguration:**
- User signs in but lands on homepage -> `TRUSTED_ORIGINS` missing domain
- OAuth callback 500 error -> `BETTER_AUTH_URL` mismatch
- Google "redirect_uri_mismatch" -> URI not registered in Google Cloud

---

## Environment Variables

### Local Development (`.dev.vars`)

```
BETTER_AUTH_SECRET=your-32-char-secret
BETTER_AUTH_URL=http://localhost:5173
GOOGLE_CLIENT_ID=optional
GOOGLE_CLIENT_SECRET=optional
# Email login is disabled by default (OAuth-only). Uncomment to enable:
# ENABLE_EMAIL_LOGIN=true
# ENABLE_EMAIL_SIGNUP=true
ADMIN_EMAILS=admin@example.com

# Error tracking (optional)
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ENVIRONMENT=development
```

### Production (Cloudflare Secrets)

```bash
printf "secret" | npx wrangler secret put BETTER_AUTH_SECRET
printf "https://your-app.workers.dev" | npx wrangler secret put BETTER_AUTH_URL
```

---

## Commands

```bash
pnpm dev                    # Start development server
pnpm build                  # Build for production
npx wrangler deploy         # Deploy to Cloudflare
pnpm db:generate:named "x"  # Generate migration
pnpm db:migrate:local       # Apply migrations locally
pnpm db:migrate:remote      # Apply migrations to production
pnpm db:seed                # Seed local database with test data
pnpm test                   # Run tests (vitest 4 + cloudflareTest)
pnpm type-check             # Run TypeScript check
```

---

## Cloudflare Bindings

Defined in `wrangler.jsonc`:
- `DB` - D1 database
- `AVATARS` - R2 bucket for user avatars
- `FILES` - R2 bucket for user file uploads
- `AI` - Workers AI binding (used by AI SDK via workers-ai-provider)

---

## Feature Flags

See `src/shared/config/features.ts`. Control via `VITE_FEATURE_*` env vars:

- `styleGuide` - Show style guide page (dev only by default)
- `components` - Show components showcase
- `themePicker` - Show colour theme picker
- `apiTokens` - Show API Tokens tab in settings

## App Configuration

See `src/shared/config/app.ts`. Control via env vars:

- `VITE_APP_NAME` - Application name in sidebar (default: "Vite Flare Starter")
- `VITE_DEFAULT_THEME` - Default colour theme (default, blue, green, orange, red, rose, violet, yellow)

---

## Adding shadcn/ui Components

```bash
pnpm dlx shadcn@latest add button dialog form
```

Components are copied to `src/components/ui/`.

---

**Created:** 2025-11-29
**Updated:** 2026-04-13
**Author:** Jeremy Dawes (Jezweb)
