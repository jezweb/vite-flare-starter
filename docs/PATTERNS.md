# Build Patterns

Reference code for common feature-building tasks. Each pattern points at
real modules in `src/` so you can diff against a working version rather
than copy-paste blind.

For Durable Object patterns (voice, video, real-time WS) see
[`DO_AGENTS.md`](./DO_AGENTS.md).

---

## New Server Module

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

---

## New D1 Table

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

---

## TanStack Query Hook

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

**Reference:** `src/client/modules/settings/hooks/useSettings.ts`

---

## AI Streaming Chat (ToolLoopAgent)

```typescript
// Server — ToolLoopAgent + createAgentUIStreamResponse
import { buildChatAgent } from '@/server/lib/ai'
import { createAgentUIStreamResponse, smoothStream } from 'ai'

const { agent, startTime, modelId } = await buildChatAgent({
  env, userId, user, modelId: requestedModel, systemPrompt,
})

return createAgentUIStreamResponse({
  agent,
  uiMessages: messages,
  experimental_transform: smoothStream({ chunking: 'word' }),
  sendReasoning: true,
  onFinish: async ({ messages }) => {
    await storage.saveChat({ conversationId, messages })
  },
})
```

```typescript
// Client — wrapper around @ai-sdk/react useChat
import { useChat } from '@/client/modules/chat/hooks/useChat'

const { messages, sendMessage, isLoading } = useChat({
  model: 'anthropic/claude-sonnet-4.6',
  conversationId: urlConversationId,
})
sendMessage({ text: 'Hello' })
```

**Reference:** `src/server/lib/ai/agent.ts`, `src/server/modules/chat/routes.ts`

**Critical:** The `useChat` wrapper uses refs for model/systemPrompt/conversationId to avoid stale-closure bugs, and freezes `initialMessages` at mount (adopts later loads via `chat.setMessages` only when `chat.messages.length === 0`). See `.claude/rules/chat-usechat-initial-messages.md` for the full gotcha.

---

## Conversation Persistence

Conversations are stored in D1 (`conversations` + `conversation_messages`).

```typescript
import { createD1ChatStorage } from '@/server/modules/conversations/storage'
const storage = createD1ChatStorage(c.env.DB)

const conversationId = await storage.createConversation(userId, { title, model })
const messages = await storage.loadChat(conversationId)
await storage.saveChat({ conversationId, messages })  // append-only
const conversations = await storage.listConversations(userId, { limit: 50 })
```

The `ChatStorage` interface is designed for future swap to Durable Objects.

**Reference:** `src/server/modules/conversations/storage.ts`

---

## Structured Output

```typescript
import { generateText, Output } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'

const workersai = createWorkersAI({ binding: c.env.AI })
const { output } = await generateText({
  model: workersai('@cf/moonshotai/kimi-k2.6'),
  output: Output.object({
    schema: z.object({ title: z.string(), summary: z.string() }),
  }),
  prompt: 'Summarise this text...',
})
```

**Reference:** `src/server/modules/chat/routes.ts` (`POST /extract`)

---

## MCP Integration

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
})
```

**Install:** `pnpm add @ai-sdk/mcp`

**Per-user MCP connectors:** `src/server/modules/mcp-connections/` exposes OAuth (PKCE + DCR) + bearer fallback. Connections live in D1 (`user_mcp_connections`), tokens AES-GCM encrypted via `TOKEN_ENCRYPTION_KEY`. Per-tool policies in `user_mcp_tool_policies`. Chat agent loads tools via `getUserMcpTools(env, userId)`.

**OAuth redirect critical:** Never use `window.open(authorizationUrl)` for the provider redirect — Chrome silently blocks popups fired inside React dialog event chains. Use `window.location.href = authorizationUrl`. The OAuth callback page closes itself; `window.opener.postMessage` still works across the single-tab navigation. `POST /api/mcp-connections/:id/authorize` re-issues a fresh URL for pending connections.

---

## R2 File Upload

```typescript
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

---

## Webhook Handler

```typescript
app.post('/webhooks/:provider', async (c) => {
  const body = await c.req.text()
  const signature = c.req.header('x-signature')
  if (!verifySignature(body, signature, c.env.WEBHOOK_SECRET)) {
    return c.json({ error: 'Invalid signature' }, 401)
  }
  const payload = JSON.parse(body)
  return c.json({ received: true })
})
```

---

## Full-Text Search (FTS5)

```typescript
import { createFTSIndex, searchFTS, rebuildFTSIndex } from '@/server/lib/search'

// One-time setup (migration or init endpoint)
await createFTSIndex(db, {
  table: 'conversation_messages',
  columns: ['parts'],
  ftsTable: 'conversation_messages_fts',  // auto-creates triggers
})

// Search with BM25 ranking, joined to source table
const { results } = await searchFTS(db, {
  ftsTable: 'conversation_messages_fts',
  sourceTable: 'conversation_messages',
  query: 'meeting notes',
  limit: 20,
})

// Rebuild after bulk import
await rebuildFTSIndex(db, 'conversation_messages_fts')
```

**Reference:** `src/server/lib/search/fts.ts`, wired in `src/server/modules/conversations/routes.ts`
