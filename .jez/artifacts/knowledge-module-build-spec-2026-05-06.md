---
date: 2026-05-06
status: active (planned)
companion: voice-and-knowledge-plan-2026-05-06.md (the why and shape)
owner: jez+claude
---

# Knowledge module — build spec

A future Claude session reading this cold should be able to start
construction without asking architectural questions.

## Goal

Long-form indexed reference documents per scope (user/project/org).
Two injection modes: `always` (baked into system prompt) and
`on_demand` (catalog entry + `load_knowledge` tool). FTS5-indexed
for keyword search. UI mirrors the skill editor shape.

## Files to create

### Server

#### 1. `src/server/modules/knowledge/db/schema.ts`

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'
import { projects } from '@/server/modules/projects/db/schema'

export const KNOWLEDGE_SCOPES = ['user', 'project', 'org'] as const
export const KNOWLEDGE_FORMATS = ['markdown', 'json', 'text'] as const
export const INJECTION_MODES = ['always', 'on_demand', 'disabled'] as const

export const knowledgeDocuments = sqliteTable('knowledge_documents', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  scope: text('scope', { enum: KNOWLEDGE_SCOPES }).notNull(),
  /** user.id | projects.id | organization.id depending on scope */
  scopeId: text('scope_id').notNull(),
  title: text('title').notNull(),
  /** One-liner shown in catalog injection — when to use this doc. */
  summary: text('summary').notNull(),
  /** Soft cap 100KB. Hard validate at 256KB. */
  body: text('body').notNull(),
  format: text('format', { enum: KNOWLEDGE_FORMATS }).notNull().default('markdown'),
  injectionMode: text('injection_mode', { enum: INJECTION_MODES }).notNull().default('on_demand'),
  /** Free-form tags for grouping. JSON array. */
  tags: text('tags').notNull().default('[]'),
  /** Estimated tokens for the body — set by routes on insert/update. */
  estimatedTokens: integer('estimated_tokens').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('knowledge_scope_idx').on(t.scope, t.scopeId),
  index('knowledge_injection_idx').on(t.injectionMode),
])

// FTS5 virtual table — populated via insert/update triggers in the
// migration SQL (drizzle doesn't generate FTS5 native — write the
// migration by hand).
```

#### 2. Migration `drizzle/<timestamp>_knowledge.sql`

Drizzle-generated table + a hand-written FTS5 virtual table:

```sql
-- (drizzle generates the main table)

CREATE VIRTUAL TABLE knowledge_documents_fts USING fts5(
  title, summary, body, tags,
  content='knowledge_documents',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER knowledge_ai AFTER INSERT ON knowledge_documents BEGIN
  INSERT INTO knowledge_documents_fts(rowid, title, summary, body, tags)
  VALUES (new.rowid, new.title, new.summary, new.body, new.tags);
END;
-- (similar AFTER UPDATE / AFTER DELETE triggers)
```

#### 3. `src/server/modules/knowledge/storage.ts`

CRUD helpers + scope-resolution + token-estimation.

Functions:
- `createKnowledge(db, args)` — insert, compute estimated tokens
  (`Math.ceil(body.length / 4)`), populate FTS via trigger
- `getKnowledge(db, id, userId)` — fetch with scope authorisation
- `listKnowledge(db, scope, scopeId, opts)` — by scope + tags filter
- `searchKnowledge(db, scope, scopeId, query)` — FTS5 MATCH query
- `loadAlwaysActiveKnowledge(db, userId, projectId, orgId)` — return
  full bodies of all `always` mode docs across applicable scopes

Scope resolution: chat agent has user + optional project + optional
org. Always-active loads union from all 3 scopes the user has access to.

#### 4. `src/server/modules/knowledge/routes.ts`

REST routes mounted at `/api/knowledge`:

```
GET    /                  list (scope + tags filter)
GET    /:id               read single
POST   /                  create (auth: scope must belong to caller)
PATCH  /:id               update
DELETE /:id               delete
GET    /search?q=         FTS5 search
GET    /catalog/:scope/:scopeId  on-demand catalog (for injection)
```

#### 5. `src/server/modules/chat/tools/knowledge.ts`

ToolDefinition entries, mirrors `skills.ts` patterns:

```ts
export const knowledgeSearchDef: ToolDefinition<...> = {
  name: 'knowledge_search',
  description: "Search the user's knowledge base by keyword. Returns ranked matches with title + summary. Use to discover what reference docs exist before loading one.",
  // ... implementation calls searchKnowledge
}

export const loadKnowledgeDef: ToolDefinition<...> = {
  name: 'load_knowledge',
  description: "Load a knowledge document's full body by id (returned from knowledge_search). Returns the body wrapped in <knowledge_content> tags. Use when a search hit is relevant to the user's task.",
  // ...
}

export const knowledgeDefinitions = [knowledgeSearchDef, loadKnowledgeDef]
```

Register in `src/server/modules/chat/tools/index.ts`.

#### 6. Wire injection into `src/server/modules/chat/chat-agent.ts`

Mirror the `loadAlwaysActiveSkills` pattern (section 8b):

```ts
// ─── 8c. Always-active knowledge bodies ─────────────────────────
const alwaysKnowledge = await loadAlwaysActiveKnowledge(
  this.env.DB,
  userId,
  effectiveProjectId,
  effectiveOrgId,
)
const knowledgeBlock = alwaysKnowledge.length > 0
  ? alwaysKnowledge.map(k => `### ${k.title}\n\n${k.body.trim()}`).join('\n\n---\n\n')
  : null

// In section 10 (extraSections):
if (knowledgeBlock) {
  extraSections['Active Knowledge'] = [
    'These reference documents are always available. Apply them throughout the conversation.',
    '',
    knowledgeBlock,
  ].join('\n')
}

// On-demand catalog (similar to skills catalog):
const knowledgeCatalog = await listKnowledgeForCatalog(...)
if (knowledgeCatalog.length > 0) {
  extraSections['Available Knowledge'] = [
    'Search the knowledge base when the user asks about reference material:',
    knowledgeCatalog.map(k => `- ${k.title}: ${k.summary}`).join('\n'),
    'Use knowledge_search + load_knowledge to fetch full content.',
  ].join('\n')
}
```

### Client

#### 7. `src/client/modules/knowledge/pages/KnowledgePage.tsx`

List view with:
- Search input (FTS5)
- Tag filter
- Scope toggle (My / Project / Org) — when project/org context exists
- Create button → opens KnowledgeEditor in modal or new page
- Cards: title, summary, tag pills, scope badge, injection-mode chip,
  estimated tokens

#### 8. `src/client/modules/knowledge/pages/KnowledgeDetailPage.tsx`

Reuse SkillEditor primitives (split-pane editor + preview).
Differences:
- Add scope picker (user/project/org)
- Add injection-mode toggle (`always` / `on_demand` / `disabled`)
- Show estimated tokens + warning if total `always` budget > 10K
- Add tag input

#### 9. App.tsx routes + nav.ts entry

```tsx
const KnowledgePage = lazy(() => import('./modules/knowledge/pages/KnowledgePage').then(m => ({ default: m.KnowledgePage })))
const KnowledgeDetailPage = lazy(() => ...)

// Routes:
<Route path="knowledge" element={<KnowledgePage />} />
<Route path="knowledge/:id" element={<KnowledgeDetailPage />} />

// nav.ts — Setup section:
{ to: '/dashboard/knowledge', label: 'Knowledge', icon: BookOpen, feature: 'knowledge' }
```

#### 10. Feature flag

```ts
// shared/config/features.ts
knowledge: isEnabled('VITE_FEATURE_KNOWLEDGE'),
```

## Verification gates

1. Type-check + build clean
2. Migration applies locally + remote
3. Create a 5KB markdown doc with scope=user, mode=always — open
   chat, see body in system prompt via wrangler tail
4. Switch the doc to mode=on_demand — body disappears from prompt;
   `Available Knowledge` catalog shows the title
5. Ask the agent something the doc covers — agent calls
   `knowledge_search` → `load_knowledge` → uses content
6. Create a 50KB doc — UI shows estimated token warning if total
   `always` budget > 10K
7. FTS5 search returns ranked matches for queries that hit body
   text not just title

## Cross-cutting

- **Reuse MarkdownCodeEditor + ConfigDiffCard primitives** from skills
  module. Save flow can mirror skills' propose-then-approve OR be
  direct-write (knowledge edits aren't as risky as skills).
- **Naming conventions**: snake_case tools (`knowledge_search`,
  `load_knowledge`); kebab-case routes (`/api/knowledge`); camelCase
  TS imports.
- **Don't touch**: memories module (stays for small facts), skills
  module (stays for procedures), files module (stays for attachments).
- **Token-estimate UI** should reuse the `Math.ceil(length / 4)`
  approximation from skills editor.

## TL;DR

Add `knowledge_documents` table + FTS5 index + module + REST routes
+ chat tools + injection wiring + UI. Mirror skills module shape.
~4-6h. Closes the "long-form reference doc" gap that crosbe-ai,
kindling, and rightcover all worked around differently.
