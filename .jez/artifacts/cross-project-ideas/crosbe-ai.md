# Cross-Project Patterns from Crosbe AI

**Crosbe AI** is a BI + AI platform for an Australian manufacturing company (Crosbe). Connects to a live Cloud SQL database (PostgreSQL 11) via Cloudflare Hyperdrive with D1 auth layer, uses Anthropic Claude for AI analytics, and delivers 40+ dashboard pages + AI data analyst chat.

---

## Concrete Patterns Worth Considering

### 1. R2 Data Lake for AI Tool Result Spillover
**File**: `src/server/lib/data-lake.ts`

**Pattern**: When AI tools return large datasets (e.g., SQL queries returning 10K+ rows), store in R2 as chunked JSON (`data/{id}/chunk-0.json`, `chunk-1.json`, ...) with metadata in D1. Auto-delete via R2 lifecycle (24h). Frontend fetches chunks on demand.

**Why it matters**: Avoids token bloat when AI generates huge result sets. R2 is cheap storage; AI response stays focused. Anthropic's 800K token limit is real.

**Effort**: ~3 hours. Copy data-lake.ts module; wire into chat endpoint; add R2 binding to wrangler.jsonc.

---

### 2. Static + Dynamic System Prompt Split (Prompt Caching Ready)
**File**: `src/server/lib/schema-context.ts`

**Pattern**: Separate `STATIC_SYSTEM_PROMPT` (schema docs, tool descriptions, domain knowledge — ~4.5K tokens, cacheable) from dynamic `userContext` (current date/time, user name, timezone, role). AI request includes both; Anthropic caches the static portion for 5min.

**Why it matters**: Reduces token cost per turn by ~15% when you have large system prompts (database schemas, domain docs). Already built for Anthropic prompt caching feature.

**Effort**: ~1 hour. Extract your system prompt into two files; inject dynamic context at request time.

---

### 3. Token-Aware History Trimming with Haiku Summarization
**File**: `src/server/routes/conversations.ts` (lines 16–100)

**Pattern**: When conversation history exceeds token budget (80K tokens), trim oldest messages and replace with a Haiku-generated summary. Fallback to simple truncation if no API key. Caches summary in KV to avoid re-summarizing.

**Why it matters**: Keeps long conversations cheap. Haiku summarization is fast + cheap. Solves the "context grows infinitely" problem in multi-turn chat.

**Effort**: ~2 hours. Lift the `trimHistoryToTokenBudget()` function; adapt token budget for your use case; add Haiku API key.

---

### 4. Code-Based RBAC with Execution-Level Gates
**File**: `src/shared/rbac.ts`

**Pattern**: `ROLE_DATA_ACCESS` config in code (not DB) maps role IDs → allowed AI tools + table prefixes. Enforced server-side in `executeToolCall()`. System prompt is filtered per role. Includes helper functions: `extractTableNames()`, `checkTableAccess()`, `isPathAllowed()`.

**Why it matters**: Prompt injection can't bypass execution-level gates. Data access is explicit + auditable. Scales better than per-row RBAC for AI tools.

**Effort**: ~4 hours. Define your roles + data tiers; wire role check into chat middleware; add system prompt filtering.

---

### 5. Artifact Engine: Dynamic HTML via Workers + KV Cache
**File**: `src/server/lib/artifact-engine.ts`

**Pattern**: AI generates HTML (charts, visualisations, interactive components). Store in KV (`artifacts/{id}`) + D1 metadata. Frontend polls KV for code, renders in iframe. Supports Recharts via esm.sh CDN.

**Why it matters**: Decouples AI from rendering. Users get embeddable, shareable HTML artifacts. Can refresh via re-running SQL against live data.

**Effort**: ~6 hours. Set up Workers code generation flow; add KV namespace; implement iframe rendering + refresh logic.

---

### 6. Sidebar + RBAC Config as Shared Data
**File**: `src/shared/sidebar-pages.ts`

**Pattern**: Single source of truth for navigation structure. `SIDEBAR_SECTIONS[]` array used by both Sidebar component (UI) and Admin role-permission grid (role assignment). Paths support wildcards (`/production/*`).

**Why it matters**: Prevents divergence between sidebar nav and permission checks. Sidebar flash on load fixed via localStorage cache.

**Effort**: ~1.5 hours. Create shared config; export from both client-nav and admin-roles components.

---

### 7. Multi-Role AI System Prompt Injection
**File**: `src/server/lib/schema-context.ts` + `src/shared/rbac.ts`

**Pattern**: System prompt includes a `data_restriction_note` per role (e.g., "You do NOT have access to material cost data..."). Injected before each AI call. Prevents accidental data leakage if user asks AI to bypass restrictions.

**Why it matters**: Defense in depth. Users see helpful warnings. Audit trail shows which role restrictions apply.

**Effort**: ~1 hour. Add `data_restriction_note` string to your role config; inject into system prompt template.

---

### 8. D1 + Postgres Dual-Database Pattern
**File**: `wrangler.jsonc`, `src/server/middleware/db.ts`, `src/server/auth.ts`

**Pattern**: Auth + KB + D1-only modules (knowledge base, user memories, artifacts, conversations, settings) in D1. Analytics + operational data in Hyperdrive (Cloud SQL). Middleware exposes both bindings; routes use what they need.

**Why it matters**: D1 for app data (low latency, ACID), Postgres for analytical queries (large joins, aggregations). Keeps concerns separated.

**Effort**: ~2 hours. This is mostly architectural (one-time). Add middleware layer that injects both bindings.

---

### 9. Schema Context + AI Tool Definitions in One Module
**File**: `src/server/lib/schema-context.ts` + `src/server/lib/sql-tool.ts`

**Pattern**: Schema description for system prompt lives in same module as tool definitions. Both reference the same table names + column docs. Single source of truth prevents schema docs from drifting from actual tools.

**Why it matters**: "Hallucinated table" bugs are rare. Schema docs are auto-generated from a single definition.

**Effort**: ~2 hours. Extract your schema docs; add tool definitions to same module.

---

### 10. Scheduled Tasks via Cron Handler
**File**: `src/server/scheduled.ts`

**Pattern**: Single entry point for all cron jobs (CF Email Sending binding + scheduled workers). Handles daily digest generation, anomaly alerts, KPI cache refresh. Uses D1 batch operations for multi-row inserts.

**Why it matters**: Centralised job orchestration. Easy to see all scheduled work in one place. Batching prevents N+1 insert queries.

**Effort**: ~3 hours. Create scheduled.ts module; wire into wrangler.jsonc cron binding; implement your job handlers.

---

## Skip These (Already in Vite Flare Starter or Project-Specific)

- **Auth via better-auth**: vite-flare-starter already uses it (D1 adapter + Google OAuth)
- **Hono + Cloudflare Workers**: Same foundation
- **TanStack Query**: Both projects use it for client data fetching
- **React.lazy code splitting**: Already in vite-flare-starter
- **Tailwind + shadcn/ui**: vite-flare-starter has this
- **Ostendo ERP integration**: Crosbe-specific business logic
- **Manufacturing domain logic** (Nelson Rules, SPC charts, compressive strength): Specific to Crosbe

---

## Implementation Priority

**High-impact, quick wins** (1–2 hours each):
1. Sidebar-pages shared config
2. Role data-restriction notes in system prompt
3. Static + dynamic prompt split

**Medium effort, high value** (3–4 hours):
1. R2 data lake for large AI results
2. Token-aware history trimming
3. Scheduled task orchestration

**Larger lift, powerful patterns** (5–6 hours):
1. Execution-level RBAC enforcement
2. Artifact engine + KV caching

---

## Files to Reference

| File | Purpose |
|------|---------|
| `CLAUDE.md` | 48KB project overview + all phases + gotchas |
| `DATABASE_ANALYSIS.md` | Schema narrative (row counts, domains, relationships) |
| `DATABASE_SCHEMA.md` | Full table reference (1.3MB) — use as template for your schema docs |
| `src/server/lib/data-lake.ts` | R2 chunking pattern |
| `src/server/lib/schema-context.ts` | Static/dynamic prompt split |
| `src/server/routes/conversations.ts` | History trimming + Haiku summarization |
| `src/shared/rbac.ts` | Role config + execution-level checks |
| `src/server/lib/artifact-engine.ts` | Workers HTML generation |
| `src/shared/sidebar-pages.ts` | Sidebar config shared |
| `src/server/scheduled.ts` | Cron job orchestration |
