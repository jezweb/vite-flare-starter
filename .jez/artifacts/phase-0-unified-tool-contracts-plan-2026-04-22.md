# Phase 0 — Unified Tool Contracts + AgentContext

**Date**: 2026-04-22
**Status**: ✅ SHIPPED (commit `13eb176` + follow-up `c227d55`)
**Prerequisite for**: Phases A-E in `ai-sdk-standards-adoption-plan-2026-04-22.md`
**Time taken**: ~2.5 hours (matched the estimate)

## Shipped outcome

- All 23 tool modules migrated to `ToolDefinition<I, O>` — no legacy
  `build*Tools(ctx)` factories remain
- Aggregator reduced to a single `collectAvailableTools(allDefinitions, ctx)`
  call — no conditional branches, no `Object.assign` chains
- Shared contracts at `src/shared/agent/` (tool, context, telemetry)
- Server adapter at `src/server/lib/ai/tool-adapter.ts` with Zod validation
  + telemetry wrapping
- Per-tool `isAvailable(ctx)` replaces all the module-level early returns
- 4 domains have strict typed renderers (gmail, drive, calendar, web-search)
  — rest use `z.unknown()` for now, will be tightened opportunistically
- `wrapLegacyToolkit` bridge was built and then deleted — the "no backward
  compat unless production data depends on it" rule held

## Learning captured from the journey

Originally planned Option B (pilot + high-value migrate, rest on legacy
factories via a `wrapLegacyToolkit` bridge). Jez pushed back: "why are
we keeping legacy code or things that we dont need". The honest answer
was that migrating all 23 modules was 2+ hours of mechanical work, but
the pragmatic shortcut violated his "no backward compat" rule and
codified drift. Full migration was the right call.

→ Captured in `~/.claude/rules/think-in-contracts-not-code.md`

## Goal (one sentence)

Make "adding a new tool" a single contract that encodes server execution,
validation, user-gating, and client rendering — so every downstream SDK
adoption phase plugs into one place.

## What "done" looks like

A new tool is added by:

1. Create / edit one file in `src/server/modules/chat/tools/` exporting a
   `ToolDefinition<Input, Output>`
2. Optionally add a renderer in `src/client/modules/chat/components/tool-renderers/`
   that type-imports `Output` from step 1
3. Register in two lines: one in the server aggregator, one in the client
   registry

That's it. No stray wiring. No forgetting to add outputSchema.
No forgetting to filter by `isAvailable`. No drift between server output
type and client renderer type.

## Non-goals

- No change to which tools exist or what they do
- No change to the AI SDK major version
- No move to Cloudflare Agents SDK / per-conversation DOs
- No monorepo extraction
- No breaking changes to conversations / messages / D1 schemas
- No change to approval flow, MCP-UI, inline UI markers (`_ui` tools)

## The contract

### `src/shared/agent/tool.ts` (NEW)

```ts
import type { ZodType } from 'zod'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AgentContext } from './context'

/**
 * Unified server-side + client-side tool contract.
 *
 * Server imports the full object (including `execute`).
 * Client imports type-only + optionally the `render` field for display.
 * Vite tree-shakes server-only code from client bundles because `execute`
 * is never referenced from client entry points.
 */
export interface ToolDefinition<TInput, TOutput> {
  /** Canonical snake_case tool name (used by the model). */
  name: string
  description: string
  inputSchema: ZodType<TInput>
  /**
   * Required. Runtime validation catches provider bugs; type inference
   * flows to client renderers via `z.infer<typeof outputSchema>`.
   */
  outputSchema: ZodType<TOutput>
  /**
   * Per-user / per-environment availability. Returns false to omit the
   * tool from the agent's toolkit for this context. Default: always on.
   */
  isAvailable?: (ctx: AgentContext) => boolean | Promise<boolean>
  /**
   * `true` → always ask; function → per-input decision (e.g. "approve for
   * external recipients only"). Emits `approval-requested` in the stream.
   */
  needsApproval?: boolean | ((input: TInput) => boolean)
  execute: (input: TInput, ctx: AgentContext) => Promise<TOutput>
  /**
   * Client-side rendering metadata. Optional — tools without a renderer
   * fall back to the generic JSON dump in ToolCard.
   */
  render?: {
    icon?: LucideIcon
    displayName?: string | ((toolName: string) => string)
    summary?: (output: TOutput, input: TInput) => string | null
    expanded?: (props: { output: TOutput; input: TInput }) => ReactNode
  }
}
```

### `src/shared/agent/context.ts` (NEW)

```ts
import type { Env } from '@/server/env' // or wherever the Env type lives
import type { TelemetrySink } from './telemetry'

export interface AgentContext {
  env: Env
  userId: string
  user: {
    id: string
    email: string
    name?: string | null
    image?: string | null
    role: 'user' | 'manager' | 'admin'
  }
  conversationId?: string
  projectId?: string | null
  model: {
    id: string
    provider: 'workers-ai' | 'openrouter' | 'anthropic' | 'openai' | 'google'
    supportsVision: boolean
    supportsTools: boolean
  }
  telemetry: TelemetrySink
  signal?: AbortSignal
}
```

### `src/shared/agent/telemetry.ts` (NEW)

```ts
export interface TelemetrySink {
  recordTool(event: {
    name: string
    durationMs: number
    ok: boolean
    error?: string
    inputSize?: number
    outputSize?: number
  }): void | Promise<void>
  recordStep(event: {
    index: number
    inputTokens?: number
    outputTokens?: number
    finishReason?: string
  }): void | Promise<void>
}

/** No-op sink for tests and early forks. */
export const nullTelemetry: TelemetrySink = {
  recordTool: () => {},
  recordStep: () => {},
}
```

## Sub-phases

Each sub-phase is independently checkpointable. After 0.1 + 0.2 we have
one fully-migrated tool as proof; we can stop and evaluate before doing
bulk work.

### 0.1 — Contracts + scaffolding (20 min)

- Create `src/shared/agent/{tool,context,telemetry}.ts`
- Add adapter `src/server/lib/ai/tool-adapter.ts`:
  - `toAiSdkTool(def: ToolDefinition, ctx: AgentContext)` — converts our
    ToolDefinition into the AI SDK's `tool()` shape with Zod validation
    wrapped around execute, telemetry recorded on pre/post
  - `collectAvailableTools(defs: ToolDefinition[], ctx: AgentContext)` —
    filters by `isAvailable(ctx)` in parallel

**Acceptance**: `pnpm type-check` green. No runtime change yet.

### 0.2 — Pilot: migrate `gmail_search` (30 min)

This is the dress rehearsal. If the pilot feels awkward we reconsider
before touching 12 more files.

Changes:
1. In `src/server/modules/chat/tools/google-workspace.ts`:
   - Extract `GmailSearchOutput = z.object({...})` Zod schema
   - Export typed `gmailSearchDefinition: ToolDefinition<GmailSearchInput, GmailSearchOutput>`
   - `execute: async (input, ctx) => ...` — change ctx shape from
     `{env, userId}` to full `AgentContext`
   - `isAvailable(ctx)` replaces the module-level
     `isGoogleWorkspaceEnabled(env)` gate (per-tool, per-scope)
2. In `src/server/modules/chat/tools/index.ts`:
   - Start collecting `ToolDefinition[]` instead of `Record<string, tool>`
   - Pass through `toAiSdkTool` adapter at the boundary
3. In `src/server/lib/ai/agent.ts`:
   - Accept `ToolDefinition[]` alongside legacy-shape tools during migration
   - Convert via adapter before handing to `streamText`
4. In `src/client/modules/chat/components/tool-renderers/gmail.tsx`:
   - Replace local `GmailSearchOutput` interface with
     `import type { GmailSearchOutput } from '@/server/modules/chat/tools/google-workspace'`
   - Renderer's `summary(output)` / `expanded({output, input})` now receive
     inferred types, no manual casts
5. Deploy + smoke-test via the existing gmail_search flow

**Acceptance**:
- Gmail search works live, summary badge shows "3 messages" etc.
- `grep "as GmailSearch" src/client` returns nothing
- `pnpm type-check` catches deliberate schema/renderer drift (add a wrong
  field to verify the error, then revert)

### 0.3 — Bulk migration (60 min)

Migrate the remaining tool files. Each follows the same recipe as 0.2.
Grouped by risk level:

| File | Tools | Risk | Notes |
|---|---|---|---|
| `core.ts` | get_server_time, get_model_info, calculate | Low | Simple, no external deps |
| `memory.ts` | remember, recall, search_memory, forget | Low | D1-backed, clean |
| `todo.ts` | todo_add, update, list, clear | Low | user_meta table |
| `skills.ts` | load_skill | Low | reads bundled + R2 skills |
| `files.ts` | fs_list, read, write, delete | Low | R2 + auth scope |
| `search.ts` | web_search | Low | already has renderer — just re-type |
| `places.ts` | places_search, places_details | Low | straightforward API |
| `audio.ts` | transcribe_audio, speak_text | Medium | returns binary-ish data |
| `browser.ts` | browser_markdown, extract, screenshot, links, content | Medium | 5 tools, Cloudflare API |
| `code.ts` | run_python, run_shell, run_js | Medium | Durable Object sandbox |
| `delegate.ts` | delegate | High | recursive — calls buildChatAgent itself. Must use AgentContext for child |
| `ui.ts` | 12 UI tools | High-touch | Output schemas for `_ui` markers. Keep `ChatUiElement` renderer (not the new registry). Each tool needs outputSchema for its marker shape |
| `google-workspace.ts` (rest) | gmail_send, drive_search, calendar_upcoming, calendar_create | Low (pattern established in 0.2) | Existing renderers need re-type |

**Gotcha for `ui.ts`**: these tools return `{_ui: 'offer_choices', ...}`
markers that get intercepted by `MessageRenderer` BEFORE hitting the
tool-renderer registry. The ToolDefinition still applies (schemas,
availability) but `render` is left undefined — `ChatUiElement` handles
display via the existing path. Document this clearly.

**Gotcha for `delegate.ts`**: the delegate tool spawns a sub-agent. Its
execute needs to build a child `AgentContext` (copies from parent, maybe
adds `depth: n+1`). Add `depth?: number` to AgentContext to guard
against runaway recursion.

**Acceptance**: every tool file exports `ToolDefinition[]` from a single
`definitions` or `toolsFor<Domain>(args)` entry point. Old shape is gone.

### 0.4 — MCP adapter (15 min)

MCP tools come pre-built from `@ai-sdk/mcp`. Can't wrap them in our
ToolDefinition trivially because they're dynamic and we don't know the
output schema. But we CAN give them a uniform surface:

In `src/server/lib/ai/user-mcp.ts`:
```ts
export async function getUserMcpDefinitions(
  ctx: AgentContext,
): Promise<ToolDefinition<unknown, unknown>[]>
```

Each MCP tool is wrapped:
- `name`: tool's advertised name (prefixed with `mcp_` or server handle
  to avoid collision)
- `inputSchema`: derived from the MCP tool's JSON Schema → Zod
- `outputSchema`: fallback `z.unknown()` (MCP doesn't advertise output)
- `isAvailable`: checks the user's `user_mcp_connections` for an active
  row with this tool's server
- `execute`: calls the MCP tool with the input
- `render`: undefined → generic fallback JSON dump OR MCP-UI resource
  rendering if the tool returns one

Acceptance: MCP tools appear alongside native tools in the agent toolkit
with consistent ToolCard shell. Per-user gating still works.

### 0.5 — AgentContext wiring (30 min)

Refactor `buildChatAgent()` in `src/server/lib/ai/agent.ts`:

```ts
// Before
export async function buildChatAgent({
  env, userId, user, modelId, systemPrompt,
}: BuildParams) {...}

// After
export async function buildChatAgent(
  ctx: AgentContext,
  options: { systemPrompt?: string } = {},
) {...}
```

In `src/server/modules/chat/routes.ts`:
```ts
const ctx: AgentContext = {
  env: c.env,
  userId: user.id,
  user,
  conversationId,
  projectId,
  model: resolveModel(requestedModel),
  telemetry: createD1Telemetry(c.env.DB, user.id),
  signal: c.req.raw.signal,
}
const { agent, startTime, modelId } = await buildChatAgent(ctx, { systemPrompt })
```

`createD1Telemetry` is a stub for Phase B to flesh out — it just writes
to `ai_usage` table (extended in Phase B).

**Acceptance**: chat still streams. Tool execution still works. Telemetry
is a stub but records something per tool call we can verify with
`SELECT * FROM ai_usage LIMIT 5`.

### 0.6 — Cleanup + docs (15 min)

- Remove old `BuildCtx`, ad-hoc tool builder function signatures
- Update CLAUDE.md "How to build a new tool" section with the new recipe
- Update `src/server/modules/chat/tools/README.md` if it exists; create
  if it doesn't
- Delete dead imports, re-run eslint
- Type-check, build, deploy

**Acceptance**: fresh read of CLAUDE.md gives a complete "add a tool"
walkthrough with the new contract.

## File-by-file impact summary

| File | Action |
|---|---|
| `src/shared/agent/tool.ts` | CREATE |
| `src/shared/agent/context.ts` | CREATE |
| `src/shared/agent/telemetry.ts` | CREATE |
| `src/server/lib/ai/tool-adapter.ts` | CREATE |
| `src/server/lib/ai/agent.ts` | Refactor signature + internals |
| `src/server/lib/ai/user-mcp.ts` | Return ToolDefinition[] |
| `src/server/modules/chat/tools/index.ts` | Aggregate ToolDefinition[] |
| `src/server/modules/chat/tools/*.ts` (13 files) | Reshape to ToolDefinition |
| `src/server/modules/chat/routes.ts` | Build AgentContext, pass to agent |
| `src/client/modules/chat/components/tool-renderers/*.tsx` (4 files) | Type-import inferred output types |
| `CLAUDE.md` | Update "adding a tool" section |
| `src/server/modules/chat/tools/README.md` | Create if missing |

**Files NOT touched**: conversation storage, ChatStorage interface,
MessageRenderer.tsx (except possibly type imports), ToolCard, ui.ts
ChatUiElement path, approval flow, artifact / document rendering,
settings module, any other starter modules.

## Rollout order within a session

Can be done in one focused evening, or split across two:

**Session 1 (~1.5h)**: 0.1 → 0.2 → deploy pilot → verify gmail_search
works live → decide whether to proceed
**Session 2 (~1h)**: 0.3 → 0.4 → 0.5 → 0.6 → deploy v1.9.0-alpha.1

After session 2, Phase A becomes ~10 min (outputSchemas are already
required). Phase B gets its telemetry plumbing for free. Phases C-E gain
a typed contract to target.

## Rollback strategy

Each sub-phase is a single commit. If 0.2 feels wrong, revert the commit
and we still have the contract from 0.1 sitting inert. If 0.5 breaks the
chat loop, revert to the pre-refactor `buildChatAgent(BuildParams)` — the
tool definitions from 0.3 still work with an adapter.

The pilot pattern means we know by minute 45 whether this approach is
sound. If gmail_search doesn't feel materially cleaner to define, we
stop, revert, and re-evaluate.

## Open questions (flag for Jez)

1. **Location of the shared contract**: `src/shared/agent/` vs
   `src/shared/tools/` vs `src/lib/agent/`.
   My preference: `src/shared/agent/` (agent primitives, not just tools
   — they'll be reused if we ever add a second agent runtime).

2. **Client renderer co-location**: keep renderers in
   `client/modules/chat/components/tool-renderers/` OR move alongside
   tool files as `tools/gmail.render.tsx`.
   My preference: keep current split. Renderers are React/JSX; tools are
   Node/Worker fetch + D1. Different mental modes, different review
   patterns, same directory invites accidental cross-pollination.

3. **Whether MCP tools get custom renderers**: dynamic tools can't be
   pre-rendered. For polish we could let MCP servers advertise a renderer
   hint (icon name, summary template) via a custom MCP capability. Defer
   to Phase C when we do sources work.

4. **`delegate` recursion depth cap**: add to AgentContext as `depth` +
   max_depth config? Currently no cap — risk of runaway if a model keeps
   delegating.

5. **Should `isAvailable` also run per-message (not just once)?**
   Today the toolkit is built once at request start. But a user could
   connect Google Workspace mid-conversation; the next message should
   see the new tools. Current flow DOES rebuild per-request, so this is
   fine, but worth documenting.

6. **Should the old tool files stay backward-compat during migration?**
   i.e. can a fork keep its custom tools in the old shape while core
   migrates? My preference: no — internal API, clean break in one
   commit. Forks can follow the example.

## What this ISN'T

- Not a general "platform" abstraction. Scoped to this codebase.
- Not extensible via plugins / hooks. Tools are code in this repo.
- Not a replacement for MCP. MCP is for cross-process, third-party tools;
  ToolDefinition is for first-party in-repo tools.
- Not a runtime-configurable tool system. Tools are compiled in.

## Next steps

If approved as-written: start with sub-phase 0.1 (contracts only, inert)
in the next session. Low risk, buys us the shape. Then 0.2 pilot. Decision
gate after the pilot.

If we want tweaks first: the open questions above are the candidates.

## Links

- AI SDK standards plan: `.jez/artifacts/ai-sdk-standards-adoption-plan-2026-04-22.md`
- Tool renderer registry (Phase 0.0 — already shipped 2026-04-22):
  `src/client/modules/chat/components/tool-renderers/`
