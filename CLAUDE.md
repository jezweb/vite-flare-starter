# CLAUDE.md - AI Developer Context

**Project:** Vite Flare Starter
**Version:** 2.1.0
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
| **chat** | ToolLoopAgent, tool calling, reasoning, structured output, usage logging, vision, subagents | `server/lib/ai/agent.ts`, `server/modules/chat/routes.ts`, `client/modules/chat/hooks/useChat.ts` |
| **conversations** | Conversation persistence, ChatStorage interface (D1-backed, DO-ready), sidebar UI | `server/modules/conversations/storage.ts`, `server/modules/conversations/routes.ts` |
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
| **AI** | AI SDK v6 + workers-ai-provider + OpenRouter (16 models across 8 providers) |
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

### Pattern 4: AI Streaming Chat (ToolLoopAgent)

```typescript
// Server: ToolLoopAgent + createAgentUIStreamResponse
import { buildChatAgent } from '@/server/lib/ai'
import { createAgentUIStreamResponse, smoothStream } from 'ai'

// Build agent with all tools, system prompt, logging encapsulated
const { agent, startTime, modelId } = await buildChatAgent({
  env, userId, user, modelId: requestedModel, systemPrompt,
})

// Stream via AI SDK's agent response pattern
return createAgentUIStreamResponse({
  agent,
  uiMessages: messages,
  experimental_transform: smoothStream({ chunking: 'word' }),
  sendReasoning: true,
  onFinish: async ({ messages }) => {
    await storage.saveChat({ conversationId, messages })  // Persist conversation
  },
})
```

```typescript
// Client: useChat hook (wrapper around @ai-sdk/react useChat)
// Uses refs for model/systemPrompt/conversationId to avoid stale-closure bugs
// when switching models in the UI. The transport is memoised once; refs update
// on each render so prepareSendMessagesRequest always reads the latest values.
// initialMessages is frozen at mount — later changes from useConversationMessages
// are adopted via setMessages only when chat.messages is empty, so a URL
// transition from /chat to /chat/:id never clobbers in-flight streaming state.
import { useChat } from '@/client/modules/chat/hooks/useChat'
const { messages, sendMessage, isLoading, conversationId, addToolApprovalResponse } = useChat({
  model: 'anthropic/claude-sonnet-4.6',  // or any id from src/shared/config/models.ts
  conversationId: urlConversationId,      // Load existing conversation
})
sendMessage({ text: 'Hello' })
```

**Reference:** `src/server/lib/ai/agent.ts` (agent factory), `src/server/modules/chat/routes.ts` (streaming endpoint)

**Gotcha (fixed 2026-04-22):** Do NOT pass a reactive `initialMessages` prop directly to `useAIChat` — the SDK treats the prop as a re-seed signal. When `useConversationMessages(urlConversationId)` resolves after the URL transitions from `/chat` to `/chat/:id`, it clobbers in-flight streaming state and the transcript goes blank until reload. The `useChat` wrapper in this repo freezes `initialMessages` at mount and only adopts later loads via `chat.setMessages` when `chat.messages.length === 0`.

### Pattern 4b: Conversation Persistence

```typescript
// Conversations are stored in D1 (conversations + conversation_messages tables)
import { createD1ChatStorage } from '@/server/modules/conversations/storage'

const storage = createD1ChatStorage(c.env.DB)

// Create
const conversationId = await storage.createConversation(userId, { title, model })

// Load
const messages = await storage.loadChat(conversationId)

// Save (append-only — only inserts new messages)
await storage.saveChat({ conversationId, messages })

// List (paginated, sorted by updatedAt)
const conversations = await storage.listConversations(userId, { limit: 50 })
```

The `ChatStorage` interface is designed for future swap to Durable Objects (Cloudflare Agents SDK).

**Reference:** `src/server/modules/conversations/storage.ts`, `src/server/modules/conversations/routes.ts`

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

**Per-user MCP connectors (Phase 5):** `src/server/modules/mcp-connections/` exposes a catalogue + OAuth (PKCE + DCR) + bearer fallback. Connections live in D1 (`user_mcp_connections`), tokens AES-GCM encrypted at rest via `TOKEN_ENCRYPTION_KEY`. Per-tool policies (always/ask/never) in `user_mcp_tool_policies`. The chat agent loads user connections via `getUserMcpTools(env, userId)` in `src/server/lib/ai/user-mcp.ts`.

**OAuth redirect gotcha (fixed 2026-04-22):** Never use `window.open(authorizationUrl)` for the provider redirect — Chrome silently blocks popups fired inside React dialog event chains (the user-gesture chain is lost when the dialog defers). Always use `window.location.href = authorizationUrl` for the initial hand-off. The OAuth callback page closes itself and `window.opener.postMessage` is still available if you need to message the parent tab on return. A `POST /api/mcp-connections/:id/authorize` endpoint re-issues a fresh `authorizationUrl` for pending connections so users can retry if the flow is interrupted.

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

### Pattern 9: Full-Text Search (FTS5)

```typescript
import { createFTSIndex, searchFTS, rebuildFTSIndex } from '@/server/lib/search'

// One-time setup (in a migration or init endpoint):
await createFTSIndex(db, {
  table: 'conversation_messages',
  columns: ['parts'],                    // JSON text column
  ftsTable: 'conversation_messages_fts', // auto-creates triggers
})

// Search with BM25 ranking, joined to source table:
const { results } = await searchFTS(db, {
  ftsTable: 'conversation_messages_fts',
  sourceTable: 'conversation_messages',
  query: 'meeting notes',
  limit: 20,
})

// Rebuild after bulk import:
await rebuildFTSIndex(db, 'conversation_messages_fts')
```

**Reference:** `src/server/lib/search/fts.ts`, wired in `src/server/modules/conversations/routes.ts` (`GET /search`)

### Pattern 10: Durable Object Agent (voice / streaming WS)

For features that need a persistent stateful connection per-session — voice capture, live collaboration, multiplayer, real-time dashboards — use a Durable Object wired via the `agents` SDK.

Four pieces to get right:

```typescript
// 1. Define the DO class — extend Agent (or a mixin like withVoiceInput)
// src/server/modules/voice/voice-agent.ts
import { Agent, type Connection, type ConnectionContext } from 'agents'
import { withVoiceInput, WorkersAINova3STT } from '@cloudflare/voice'

const InputAgent = withVoiceInput(Agent)

export class VoiceInputExample extends InputAgent<any> {
  transcriber = new WorkersAINova3STT((this.env as { AI: Ai }).AI)

  async onConnect(conn: Connection, _ctx: ConnectionContext) {
    conn.send(JSON.stringify({ type: 'welcome' }))
  }

  async onTranscript(text: string, _conn: Connection) {
    this.broadcast(JSON.stringify({ type: 'utterance', text }))
  }
}
```

```typescript
// 2. Re-export from Worker entry + wrap fetch with routeAgentRequest
// src/server/index.ts
import { routeAgentRequest } from 'agents'
export { VoiceInputExample } from './modules/voice/voice-agent'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const agentResponse = await routeAgentRequest(request, env)
    if (agentResponse) return agentResponse
    return app.fetch(request, env, ctx)
  },
}
```

```jsonc
// 3. wrangler.jsonc — DO binding + SQLite migration + /agents/* routing
{
  "assets": {
    "run_worker_first": ["/api/*", "/agents/*"]
  },
  "durable_objects": {
    "bindings": [
      { "name": "VoiceInputExample", "class_name": "VoiceInputExample" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["VoiceInputExample"] }
  ]
}
```

```tsx
// 4. Client: use the hook, set instance name = your session id
// src/client/modules/voice/pages/VoiceInputExamplePage.tsx
import { useVoiceInput } from '@cloudflare/voice/react'

const { transcript, interimTranscript, audioLevel, start, stop, toggleMute } =
  useVoiceInput({ agent: 'VoiceInputExample', name: sessionId })
```

**Gotchas that cost 30 min if missed:**

| Gotcha | Symptom |
|---|---|
| Forgot to add `/agents/*` to `run_worker_first` | WS requests hit static assets → 404, DO never touched |
| Forgot to `export { VoiceInputExample }` from Worker entry | `wrangler deploy` errors "Durable Object class not found" |
| Class in bindings but missing from `migrations.new_sqlite_classes` | Deploy ok, but first request errors "DO storage not provisioned" |
| `useVoiceInput` hook `isListening` stays false during recording | Not a bug — it flips true only once real audio is flowing. Use your own local phase state for the status label. |
| Browser WS URL wrong | Path is `/agents/{kebab-case-class-name}/{instance-name}` — the SDK auto-converts the `agent:` prop to kebab-case |

**When to use this over polling or a Hono endpoint:** anything that needs >1 message/sec, server→client push, or per-session CPU state. For plain REST CRUD or infrequent updates, Hono + TanStack Query is simpler.

**Reference:** `src/server/modules/voice/voice-agent.ts` + `src/client/modules/voice/pages/VoiceInputExamplePage.tsx`. Gated by `voiceAgent` feature flag (default OFF — set `VITE_FEATURE_VOICE_AGENT=true` to enable the nav item). The DO itself is always compiled so the pattern works as a pure code reference even when disabled.

### Pattern 10b: Video input agent (no SDK, just primitives)

Cloudflare has no `@cloudflare/video` package (as of 2026-04-22). For
"describe what the user is showing" / "OCR this whiteboard" / "caption
this scene" use cases, a simple sampled-frames-over-WS pattern works
today without any SFU/WebRTC plumbing.

**Pattern:**
- Client: `getUserMedia` → `<canvas>` sampled every N seconds → JPEG
  data URL → sent via the `agents` SDK WebSocket as a JSON message
- Server: the DO's `onMessage` handler decodes the JSON, calls the AI
  SDK's `generateText` with a vision-capable model, broadcasts the
  caption back

The DO wiring (binding, migration, class export, `run_worker_first`) is
identical to Pattern 10. Only the transport differs — `useAgent` from
`agents/react` instead of `useVoiceInput`.

**Reference:** `src/server/modules/video/video-agent.ts` +
`src/client/modules/video/pages/VideoInputExamplePage.tsx`. Gated by
`videoAgent` feature flag (default OFF — set `VITE_FEATURE_VIDEO_AGENT=true`
to enable). For 30fps continuous vision (gaze, object tracking), swap the
transport for Cloudflare Realtime SFU + raw WebRTC tracks — keep the DO's
agent logic.

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

### UI Components Available

| Component | File | What it does |
|-----------|------|-------------|
| **Command Palette** | `src/client/components/CommandPalette.tsx` | Cmd+K global search/navigation, reads from nav config |
| **Keyboard Shortcuts** | `src/client/components/KeyboardShortcuts.tsx` | Press ? to show all shortcuts |
| **Empty State** | `src/client/components/EmptyState.tsx` | No-data screens with icon, title, description, CTA button |
| **Inline Edit** | `src/client/components/InlineEdit.tsx` | Click-to-edit text fields (save on blur/Enter, cancel on Escape) |
| **Skeletons** | `src/client/components/skeletons.tsx` | Loading placeholders: StatCard, Table, Chart, List, Page |
| **Notification Bell** | `src/client/components/NotificationBell.tsx` | Unread count badge + dropdown |
| **Audio Recorder** | `src/client/components/AudioRecorder.tsx` | Voice input, live duration, returns Blob. Compact mode for toolbars |
| **Paste Upload** | `src/client/hooks/usePasteUpload.ts` | Cmd+V file/image paste handler. Global or element-scoped |

---

## Cloudflare Platform Features

The starter uses D1, R2, and Workers AI. Here's when to reach for other Cloudflare services in your fork:

### Already Configured (in wrangler.jsonc)

| Service | Binding | What it does | Used by |
|---------|---------|-------------|---------|
| **D1** | `DB` | SQLite database | Auth, all modules |
| **R2** | `AVATARS`, `FILES` | Object storage | Avatars, file uploads |
| **Workers AI** | `AI` | LLM inference (free) | Chat module via AI SDK |
| **Images** | `IMAGES` | Image transforms (resize, crop, bg removal, face crop, format conversion) | Image processing module |
| **Media** | `MEDIA` | Video transforms (resize, clip, frame extraction, audio extraction) | Media processing module |

### Add When You Need It

**Durable Objects** — stateful agents, WebSocket sessions, per-user state. **Already scaffolded** via the `VoiceInputExample` reference (enable with `VITE_FEATURE_VOICE_AGENT=true`). See "Pattern 10: Durable Object Agent" above for the full wiring — the scaffold saves you getting the 4 pieces (binding, migration, fetch-handler, Worker-entry export) aligned the first time.

Use for: AI agent conversation loops, real-time collaboration, scheduled tasks via DO.alarm(), WebSocket hibernation (80-95% cost reduction). Every AI assistant project (Apollo, Athena, Claq, l2chat) uses this pattern.

**Queues** — async job processing
```jsonc
"queues": {
  "producers": [{ "binding": "JOBS", "queue": "job-queue" }],
  "consumers": [{ "queue": "job-queue", "max_batch_size": 10 }]
}
```
Use for: background email sending, webhook delivery, image processing, any work that shouldn't block the request.

**Vectorize** — semantic search with embeddings (ready to enable)
```jsonc
// Uncomment in wrangler.jsonc after creating the index:
// npx wrangler vectorize create vite-flare-starter-vectors --dimensions=768 --metric=cosine
// npx wrangler vectorize create-metadata-index vite-flare-starter-vectors --property-name=userId --type=string
"vectorize": [{ "binding": "VECTORS", "index_name": "vite-flare-starter-vectors" }]
```
Use for: knowledge base search, RAG (retrieval-augmented generation), similar item discovery. The `semantic_search` and `vectorize_content` agent tools automatically use Vectorize when the binding is available, falling back to in-memory embedding comparison. Create metadata indexes BEFORE inserting vectors (they're not retroactive).

**KV** — low-latency key-value cache
```jsonc
"kv_namespaces": [{ "binding": "CACHE", "id": "..." }]
```
Use for: session cache, rate limiting state, frequently-read config, API response caching. Not for large objects (use R2) or complex queries (use D1).

**Browser Rendering** — headless Chrome
```jsonc
"browser": { "binding": "BROWSER" }
```
Use for: screenshots, PDF generation, web scraping, visual testing. REST API available for simple screenshot/PDF without Puppeteer.

**Cron Triggers** — scheduled execution
```jsonc
"triggers": { "crons": ["0 6 * * *"] }
```
Use for: daily reports, data cleanup, health checks. Handler is `scheduled(event, env, ctx)` in your Worker. For per-user schedules, use Durable Object alarms instead.

**Hyperdrive** — connection pooling for external databases
```jsonc
// Create: npx wrangler hyperdrive create my-hyperdrive --connection-string="postgres://user:pass@host:5432/db"
"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "..." }]
```
Use for: connecting to PostgreSQL, MySQL, or other external databases from Workers with connection pooling and query caching. Not needed for D1 (native). Relevant when a fork needs to talk to an existing database (e.g. legacy systems, data warehouses, managed PostgreSQL on AWS/GCP/Neon). Works with standard Postgres drivers — no code changes needed.

**Cloudflare Stream** — video hosting and delivery platform
```jsonc
// Not a binding — uses the Stream API via REST or the dashboard
// Upload: curl -X POST -H "Authorization: Bearer $CF_TOKEN" \
//   -F file=@video.mp4 "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/stream"
```
Use for: full video hosting with automatic encoding (adaptive bitrate, 360p-1080p), HLS/DASH playback, signed URLs for access control, upload from users (one-time upload URLs), per-creator analytics. Different from the Media Transformations binding — Stream is a complete video platform (hosting + CDN + player), while Media (`env.MEDIA`) is for on-the-fly transforms of your own video files. Use Stream when you need a YouTube-like video hosting feature.

**Containers** — long-running compute
Use for: heavy ML inference, video processing, anything that exceeds Workers CPU limits. ClawHQ uses this for compute-intensive operations.

---

## AI Module

16 curated models across 8 providers. Edit `src/shared/config/models.ts` to add or remove models — metadata comes from a bundled snapshot of [models.flared.au](https://models.flared.au) + [ai.flared.au](https://ai.flared.au). Run `pnpm models:refresh` to update.

| Source | Models | Notes |
|--------|--------|-------|
| **Workers AI** (free) | Kimi K2.5 (default), Gemma 4 26B, GLM 4.7 Flash, QwQ 32B | No API key needed |
| **Anthropic** | Claude Opus 4.6, Claude Sonnet 4.6, Claude Haiku 4.5 | Via OpenRouter |
| **OpenAI** | GPT-5.4, GPT-5.4 mini | Via OpenRouter |
| **Google** | Gemini 3.1 Pro, Gemini 3 Flash | Via OpenRouter |
| **DeepSeek** | DeepSeek V3.2 Speciale | Via OpenRouter |
| **Qwen** | Qwen 3.6 Plus | Via OpenRouter |
| **Mistral** | Mistral Large 3 2512 | Via OpenRouter |
| **xAI** | Grok 4.1 Fast | Via OpenRouter |
| **Z.AI** | GLM 5 | Via OpenRouter |

One `OPENROUTER_API_KEY` unlocks all non-Workers-AI models. Direct-provider SDKs (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) are kept as fallbacks if you prefer native routing.

AI features in the chat module: streaming, tool calling, reasoning extraction, vision (image attachments), structured output, token usage logging, message metadata, regenerate, **message editing** (truncate + re-send), **conversation search** (FTS5), **conversation export** (JSON/Markdown), response duration display, conversation persistence, MCP integration, MCP-UI rendering.

### Document Conversion

`convertToMarkdown()` in `src/server/lib/ai/documents.ts` converts uploaded files to markdown:

- **PDFs + images**: Uses `env.AI.toMarkdown()` (Cloudflare's built-in converter — free, fast, native PDF parsing)
- **Fallback**: Vision model (Kimi K2.5) for formats `toMarkdown()` doesn't handle
- **Text files**: Pass-through via `TextDecoder`

### AI SDK v7 Migration

v7 is in beta. When it goes stable, the migration is ~30 minutes:

1. Rename `stepCountIs` → `isStepCount` (2 files, 4 lines)
2. Remove `experimental_telemetry` block (1 file — we log via D1 already)
3. Add `redirect: 'follow'` to MCP transport config (1 file)
4. Drop `experimental_` prefix on promoted APIs (audio, useObject)

All AI SDK imports are concentrated in `src/server/lib/ai/` (4 files). No architectural changes needed. `ChatStorage` interface is designed for future swap to Durable Objects / CF Agents SDK.

---

## Agentic Toolkit

The chat module ships with a **modular agent toolkit** in `src/server/modules/chat/tools/`. Tools are auto-included based on which env bindings are configured.

### Tool modules

| Module | Tools | Always present? |
|--------|-------|-----------------|
| **core** | `get_server_time`, `get_model_info`, `calculate` | Yes |
| **memory** | `remember`, `recall`, `search_memory`, `forget` | Yes (uses user_meta D1 table) |
| **ui** | `offer_choices`, `show_alert`, `show_contact`, `collect_info`, `ask_questions`, `show_data_table`, `show_metric_cards`, `show_timeline`, `show_progress`, `show_comparison`, `confirm_action`, `show_map` | Yes (rendered as inline React components) |
| **skills** | `load_skill` | Yes |
| **code** | `run_python`, `run_shell`, `run_js` | Yes (returns setup msg if SANDBOX missing) |
| **delegate** | `delegate` | Yes (subagent pattern) |
| **audio** | `transcribe_audio` (Deepgram Nova 3 STT, auto language detect), `speak_text` (Deepgram Aura 2 TTS with 12 voices, Aura 1 fallback) | Yes (uses AI binding — no external API keys) |
| **todo** | `todo_add`, `todo_update`, `todo_list`, `todo_clear` | Yes (Hermes-style session task list, persisted via user_meta) |
| **browser** | `browser_markdown`, `browser_extract`, `browser_screenshot`, `browser_links`, `browser_content` | Only if `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` set |
| **search** | `web_search` | Only if a provider key is set |
| **places** | `places_search`, `places_details` | Only if `GOOGLE_PLACES_API_KEY` set |
| **files** | `fs_list`, `fs_read`, `fs_write`, `fs_delete` | Only if `FILES` R2 bucket bound |

**Adding a new tool**: create a new file in `tools/`, export a `buildXxxTools(ctx)` function, add to `tools/index.ts` aggregator. Use existing tools as reference.

### Browser Rendering tools

Use Cloudflare Browser Rendering's REST API directly — no Puppeteer/Playwright. Set up an API token at https://dash.cloudflare.com/profile/api-tokens with "Browser Rendering - Edit" permission, then set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

`browser_extract` is particularly powerful — uses the `/json` endpoint which runs Workers AI extraction natively, so you can pass natural-language prompts like "Extract product name, price, availability".

### Places tools (Google Places API)

`places_search` and `places_details` use the Google Places API (New). Set `GOOGLE_PLACES_API_KEY` (create one at https://console.cloud.google.com → enable "Places API (New)", restrict to your Worker routes in production).

The agent is auto-nudged via the system prompt to pair `places_search` with the `show_map` UI tool — so local-business queries render as a Leaflet map + scrollable card list (like claude.ai's map answers) instead of a wall of text. Same nudge fires if an MCP server exposes a tool named `google_local_places`, so you can swap to an MCP without touching the prompt.

### Search providers

Configure via `SEARCH_PROVIDER` env var (default: `serper`). All providers normalised to `{ title, url, snippet, date }`.

| Provider | Free tier | Setup |
|----------|-----------|-------|
| **Serper** (default) | 2,500 queries/month | https://serper.dev → `SERPER_API_KEY` |
| Brave | $5 monthly credits | https://brave.com/search/api/ → `BRAVE_API_KEY` |
| Tavily | 1,000 credits/month | https://tavily.com → `TAVILY_API_KEY` |
| Exa | Paid | https://exa.ai → `EXA_API_KEY` |

### Inline UI tools (vs MCP-UI)

Two patterns coexist:

- **Inline UI** (`_ui` marker) — tools return `{ _ui: 'toolName', ...args }`. Rendered in `chat-ui/ChatUiElement.tsx` using shadcn components. No iframes. Tighter integration. Use for your own app's UI.
- **MCP-UI** (SEP-1865) — external MCP servers deliver `ui://` resources. Rendered in sandboxed iframes via `ToolUIResource.tsx`. Cross-host standard. Use for plug-in capabilities.

Both render automatically when detected in tool output. The tool-name pill is hidden when rich UI displays.

### Code execution

`run_python`, `run_shell`, `run_js` use Cloudflare Sandbox — isolated Linux containers via Firecracker microVMs. Each user gets their own persistent sandbox (`user-<userId>`). Requires Workers Paid plan and a SANDBOX Durable Object binding in wrangler.jsonc.

When the binding is missing, the tools still appear in the toolkit but return a clear setup message — the agent will know what's needed.

---

## Skills System

Claude Agent Skills compatible — same SKILL.md format that works with Claude Code, Codex, Hermes, OpenClaw, Cursor, and Aider.

### Format (SKILL.md)

```yaml
---
name: my-skill
description: What this skill does and when to use it (≤1024 chars)
---

# My Skill

Step-by-step instructions the AI follows...
```

Required: `name` (lowercase-hyphens, ≤64 chars), `description` (≤1024 chars).

### Storage — three sources

1. **Bundled** — drop a SKILL.md at `skills/<name>/SKILL.md`. Picked up at build time via Vite glob. 12 examples ship with the starter.
2. **R2** — upload via `POST /api/skills/upload` with the SKILL.md content. Stored in the SKILLS R2 bucket (optional binding).
3. **GitHub** — register via `POST /api/skills/github` with a raw GitHub URL. Cached in R2 if available.

### Progressive disclosure

- **Level 1** (always loaded): `name` + `description` of every enabled skill, injected into system prompt
- **Level 2** (on demand): full SKILL.md body, loaded via the `load_skill` tool when triggered
- **Level 3** (referenced files): the skill body can mention other files, agent reads via `fs_read`

### Bundled skills

12 reference implementations covering common agent patterns:

- **Research**: `web-research`, `fact-check`, `summarise-url`
- **Writing**: `draft-email`, `rewrite-for-audience`
- **Documents**: `document-qa`, `extract-structured-data`
- **Self-management**: `morning-brief`, `remember-conversation`, `save-research-doc`
- **Workflows**: `compare-options`, `plan-task`, `code-review`

Each demonstrates a different combination of primitive tools — fork, modify, add your own.

### Adding skills from external sources

```bash
# From GitHub (raw URL)
curl -X POST /api/skills/github \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://raw.githubusercontent.com/anthropics/skills/main/pdf/SKILL.md"}'

# From inline content
curl -X POST /api/skills/upload \
  -H 'Content-Type: application/json' \
  -d '{"content": "---\nname: my-skill\ndescription: ...\n---\n\n..."}'
```

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
pnpm models:refresh         # Update AI model catalogue from flared.au
pnpm test                   # Run tests
pnpm type-check             # Run TypeScript check
```

---

**Created:** 2025-11-29
**Updated:** 2026-04-15
**Author:** Jeremy Dawes (Jezweb)
