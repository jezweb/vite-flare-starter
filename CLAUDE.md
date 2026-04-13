# CLAUDE.md - AI Developer Context

**Project:** Vite Flare Starter
**Version:** 1.0.0
**Purpose:** Pattern library and production-ready starter kit for Cloudflare Workers

---

## Philosophy: Pattern Library, Not a Demo

The modules in this starter are **reference implementations**. When an AI agent or developer builds a new feature in a fork, they should read the closest existing module first to learn the patterns for this stack.

**Don't delete modules you don't need.** Disable them via feature flags instead — the code stays readable as a pattern reference.

```bash
# In .dev.vars — hide modules from the sidebar without deleting code
VITE_FEATURE_CHAT=false
VITE_FEATURE_FILES=false
VITE_FEATURE_ACTIVITY=false
```

### What Each Module Demonstrates

| Module | Pattern it teaches | Key files |
|--------|--------------------|-----------|
| **chat** | AI SDK streaming, tool calling, reasoning middleware, structured output, usage logging, vision | `server/modules/chat/routes.ts`, `tools.ts`, `client/modules/chat/hooks/useChat.ts` |
| **files** | R2 file upload/download, multipart form handling, file metadata in D1 | `server/modules/files/routes.ts` |
| **activity** | Audit logging with pagination, entity history, stats aggregation | `server/modules/activity/routes.ts` |
| **notifications** | In-app notification service, unread counts, bulk operations | `server/modules/notifications/routes.ts` |
| **api-tokens** | Token generation, SHA-256 hashing, scope-based access control | `server/modules/api-tokens/routes.ts` |
| **feature-flags** | DB-backed feature toggles, public/admin endpoints | `server/modules/feature-flags/routes.ts` |
| **organization** | Single-row business settings with upsert | `server/modules/organization/routes.ts` |
| **admin** | User management, role promotion, admin stats | `server/modules/admin/routes.ts` |
| **settings** | Profile CRUD, password change, preferences, session management, data export | `server/modules/settings/routes.ts` |

---

## Forking This Project

Read [FORKING.md](./FORKING.md) for step-by-step instructions.

**Quick start after forking:**
1. Edit `src/shared/config/nav.ts` — add your product's nav items
2. Edit `src/shared/config/features.ts` — disable modules you don't need
3. Edit `src/shared/config/app.ts` — rebrand (name, logo, token prefix)
4. Create your first module following the patterns below

### Security: Rebranding

Change these before deploying to production:

| What | Where | Default |
|------|-------|---------|
| App name | `VITE_APP_NAME` env var | "Vite Flare Starter" |
| Token prefix | `VITE_TOKEN_PREFIX` + `TOKEN_PREFIX` | `vfs_` |
| Page title | `index.html` | "Vite Flare Starter" |
| Favicon | `public/` | Default |
| GitHub links | `VITE_GITHUB_URL=` (empty to hide) | Shown |

---

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

---

## Config-Driven Navigation

The sidebar is driven by `src/shared/config/nav.ts`. Edit this file to customise navigation — don't modify the layout component.

```typescript
// src/shared/config/nav.ts
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard', label: 'Home', icon: Home },
      { to: '/dashboard/chat', label: 'AI Chat', icon: MessageSquare, feature: 'chat' },
      { to: '/dashboard/your-feature', label: 'Your Feature', icon: YourIcon },
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

**Feature flags** in `src/shared/config/features.ts` control item visibility:
- `chat`, `files`, `activity`, `notifications`, `apiTokens` — module visibility
- `themePicker` — colour theme picker in preferences
- `devTools`, `styleGuide`, `components` — dev tool pages

---

## Patterns: How to Build Features

### Pattern 1: New Server Module

```typescript
// src/server/modules/your-module/routes.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { yourTable } from './db/schema'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

app.get('/', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)
  const items = await db.select().from(yourTable).where(eq(yourTable.userId, userId))
  return c.json({ items })
})

app.post('/', zValidator('json', createSchema), async (c) => {
  const input = c.req.valid('json')
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)
  await db.insert(yourTable).values({ ...input, userId })
  return c.json({ success: true }, 201)
})

export default app

// Register in src/server/index.ts:
// app.route('/api/your-module', yourRoutes)
```

**Reference:** `src/server/modules/files/routes.ts` (CRUD), `src/server/modules/activity/routes.ts` (pagination + stats)

### Pattern 2: New D1 Table

```typescript
// src/server/modules/your-module/db/schema.ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const yourTable = sqliteTable('your_table', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('your_table_user_id_idx').on(table.userId),
])

// Add to src/server/db/schema.ts:
// export { yourTable } from '@/server/modules/your-module/db/schema'

// Then generate migration:
// pnpm db:generate:named "add_your_table"
```

**Reference:** `src/server/modules/chat/db/schema.ts` (simple), `src/server/modules/files/db/schema.ts` (with FK)

### Pattern 3: TanStack Query Hook

```typescript
// src/client/modules/your-module/hooks/useYourData.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export function useYourData() {
  return useQuery({
    queryKey: ['your-module', 'list'],
    queryFn: () => apiClient.get<{ items: YourType[] }>('/api/your-module'),
  })
}

export function useCreateYourData() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateInput) =>
      apiClient.post<{ success: boolean }>('/api/your-module', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['your-module'] })
    },
  })
}
```

**Reference:** `src/client/modules/settings/hooks/useSettings.ts` (apiClient + queryKeys pattern)

### Pattern 4: AI Streaming Chat

```typescript
// Server: streamText + tools + reasoning
import { streamText, smoothStream, stepCountIs } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { buildModel } from '@/server/lib/ai/middleware'

const workersai = createWorkersAI({ binding: c.env.AI })
const model = buildModel(workersai(modelId), modelId)

const result = streamText({
  model,
  messages: await convertToModelMessages(messages),
  tools: myTools,                                      // AI SDK tool() definitions
  stopWhen: stepCountIs(5),                            // Multi-step agent loop
  experimental_transform: smoothStream({ chunking: 'word' }),
  onFinish: async ({ usage }) => { /* log to D1 */ },
})

return result.toUIMessageStreamResponse({ sendReasoning: true })
```

```typescript
// Client: useChat hook (wrapper around @ai-sdk/react useChat)
import { useChat } from '@/client/modules/chat/hooks/useChat'
const { messages, sendMessage, isLoading, status, stop } = useChat({ model: '@cf/moonshotai/kimi-k2.5' })
// isLoading = status === 'streaming' || status === 'submitted'
sendMessage({ text: 'Hello' })
```

**Reference:** `src/server/modules/chat/routes.ts` (full implementation), `src/server/modules/chat/tools.ts` (tool definitions)

### Pattern 5: Structured Output

```typescript
import { generateText, Output } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'

const workersai = createWorkersAI({ binding: c.env.AI })
const { output } = await generateText({
  model: workersai('@cf/moonshotai/kimi-k2.5'),
  output: Output.object({
    schema: z.object({ title: z.string(), summary: z.string() }),
  }),
  prompt: 'Summarise this text...',
})
```

**Reference:** `src/server/modules/chat/routes.ts` (`POST /extract` endpoint)

### Pattern 6: MCP Integration

```typescript
import { createMCPClient } from '@ai-sdk/mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://your-mcp-server/mcp' },
})
const mcpTools = await mcp.tools()

const result = streamText({
  model,
  tools: { ...localTools, ...mcpTools },
  stopWhen: stepCountIs(10),
  // ...
})
```

**Install:** `pnpm add @ai-sdk/mcp`

### Pattern 7: R2 File Upload

```typescript
// Server: multipart upload to R2
app.post('/', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file') as File
  const key = `uploads/${crypto.randomUUID()}-${file.name}`
  await c.env.FILES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  })
  // Store metadata in D1, return key
})
```

**Reference:** `src/server/modules/files/routes.ts`

### Pattern 8: Webhook Handler

```typescript
// Server: receive and verify webhooks
app.post('/webhooks/:provider', async (c) => {
  const provider = c.req.param('provider')
  const body = await c.req.text()
  const signature = c.req.header('x-signature')

  // Verify signature (provider-specific)
  if (!verifySignature(body, signature, c.env.WEBHOOK_SECRET)) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const payload = JSON.parse(body)
  // Process webhook...
  return c.json({ received: true })
})
```

---

## UI Patterns

### Pages Over Modals

Use dedicated pages for forms and content. Modals only for confirmations and quick decisions.

**Page layout pattern:** See `src/client/modules/settings/pages/SettingsPage.tsx`

### Adding a New Page

1. Create the page component in your module
2. Add Route in `src/client/App.tsx`
3. Add nav item in `src/shared/config/nav.ts`
4. Feature flag it if it should be optional

---

## AI Module

16 curated Workers AI models in `src/server/lib/ai/models.ts`:

| Tier | Models | Capabilities |
|------|--------|-------------|
| **Flagship** | Kimi K2.5 (default), Nemotron 3 120B, GPT-OSS 120B, Llama 3.3 70B | Tools, vision, reasoning |
| **Balanced** | Gemma 4 26B, Llama 4 Scout, GLM 4.7, Mistral Small 3.1, Qwen 3 30B | Tools, vision |
| **Fast** | Llama 3.1 8B, GPT-OSS 20B, Granite 4.0, Llama 3.2 3B | Low latency |
| **Reasoning** | QwQ 32B | Step-by-step thinking |

AI features in the chat module: streaming, tool calling (3 demo tools), reasoning extraction, vision (image attachments), structured output, token usage logging, message metadata, regenerate.

---

## Auth

- **OAuth-only by default** — set `ENABLE_EMAIL_LOGIN=true` for email/password
- Google OAuth with optional domain restriction via Google Cloud Console
- Session management (7-day expiry, revoke on password change)
- Admin role via `ADMIN_EMAILS` env var

---

## Deployment

```bash
printf "secret" | npx wrangler secret put BETTER_AUTH_SECRET
printf "https://your-app.workers.dev" | npx wrangler secret put BETTER_AUTH_URL
printf "http://localhost:5173,https://your-app.workers.dev" | npx wrangler secret put TRUSTED_ORIGINS
npx wrangler deploy
```

**Bindings** in `wrangler.jsonc`: `DB` (D1), `AVATARS` (R2), `FILES` (R2), `AI` (Workers AI)

---

## Commands

```bash
pnpm dev                    # Start development server
pnpm build                  # Build for production
npx wrangler deploy         # Deploy to Cloudflare
pnpm db:generate:named "x"  # Generate migration
pnpm db:migrate:local       # Apply migrations locally
pnpm db:migrate:remote      # Apply migrations to production
pnpm test                   # Run tests
pnpm type-check             # Run TypeScript check
```

---

**Created:** 2025-11-29
**Updated:** 2026-04-13
**Author:** Jeremy Dawes (Jezweb)
