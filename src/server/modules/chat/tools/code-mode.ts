/**
 * code_mode — pilot of `@cloudflare/codemode` (#113, adoption step 4).
 *
 * One tool that composes many: the model writes a single JavaScript async
 * arrow function that calls other catalog tools as `codemode.<toolName>(...)`,
 * and the whole composition runs in ONE turn inside an isolated dynamic
 * Worker (Worker Loader `LOADER` binding — same one skills scripts use).
 * Intermediate results stay in the sandbox instead of round-tripping
 * through the model's context, which is the point: a "fetch 20 rows, filter,
 * cross-reference, summarise counts" task costs one tool call instead of
 * five, and only the final return value enters the transcript.
 *
 * Security model (runtime-enforced, not prompt-enforced):
 *   - `globalOutbound: null` — `fetch()`/`connect()` throw inside the
 *     sandbox; the only capability is the tool functions we pass in.
 *   - Tool calls cross back to this Worker via Workers RPC; credentials
 *     and env never enter the generated code's world.
 *   - codemode's `filterTools` structurally drops every tool that declares
 *     `needsApproval` — approval-gated side effects cannot be reached from
 *     code, only via the normal per-call approval UI.
 *   - We additionally exclude UI tools (their output is a render marker,
 *     meaningless in code), meta tools (find_tools etc.), and the heavy
 *     compositional tier (batch tasks, sandbox python, delegation) — those
 *     have their own orchestration and shouldn't nest inside a code block.
 *
 * Cost model: the tool's description embeds generated TypeScript signatures
 * for every exposed tool (~the long-tail the model would otherwise pull in
 * one-by-one via find_tools). That block is paid on every turn while the
 * flag is on, which is why this ships OFF by default — set env
 * `CODEMODE=true` (secret or var) to opt in. Build logs
 * `code_mode_description_chars` so the trade is measurable per deployment.
 *
 * Graduation path (deliberately not in the pilot): `CodemodeRuntime` — a
 * DO-backed durable execution ledger with pause-on-approval, replay-based
 * resume and rollback. Worth wiring when forks compose side-effectful
 * tools; read-mostly composition doesn't need it (a failed block re-runs).
 */
import { DynamicWorkerExecutor } from '@cloudflare/codemode'
import { aiTools, createCodeTool } from '@cloudflare/codemode/ai'
import type { Tool, ToolSet } from 'ai'

/**
 * Explicit allowlist — the composable read/compute tier. First live test
 * exposed everything-minus-a-denylist and produced a 98-tool / 69KB types
 * block (~17K tokens per turn), which inverts the whole cost case. The
 * pilot instead curates the tools whose outputs feed naturally into code
 * (filter/join/aggregate). Defence-in-depth: createCodeTool() itself runs
 * codemode's filterTools() over whatever we pass (verified in
 * @cloudflare/codemode dist — it drops any tool declaring needsApproval),
 * so writes like entity_create can never reach the sandbox even if
 * someone adds them to this list.
 *
 * MCP tools (gmail_*, notion_*, ...) are deliberately out of v1 — they're
 * the bulk of the 98 and deserve their own opt-in once the durable
 * runtime (pause-on-approval) lands. Extend per fork by editing this set.
 */
const ALLOWED_NAMES = new Set([
  // Entities (reads — writes are approval-gated and auto-filtered anyway)
  'entity_get',
  'entity_list',
  'entity_search',
  // Reference SQL (read-only by construction — sql-guard)
  'sql_query',
  'sql_schema',
  // Knowledge + semantic recall
  'knowledge_search',
  'load_knowledge',
  'semantic_search',
  // Web reads
  'web_search',
  'trusted_search',
  // Data-lake analytics
  'read_data',
  'aggregate_data',
  'pivot_data',
  'distribution_data',
  'trend_data',
  // Files + skill-workspace reads
  'search_files',
  'fs_read',
  'fs_list',
  // Memory reads
  'recall',
  'search_memory',
  'list_all_memories',
  // Cheap utilities
  'calculate',
  'get_server_time',
])

const DESCRIPTION = `Compose multiple tools in one isolated JavaScript execution. Prefer this over chaining 3+ individual tool calls when intermediate results don't need to be shown to the user (filtering, cross-referencing, aggregating, per-item loops).

Available inside the sandbox:
{{types}}

Write ONE async arrow function in plain JavaScript that returns the final result. No TypeScript syntax. No named function definitions. Network access is blocked — only the codemode.* functions above exist. EVERY function takes exactly one input object — pass {} when a function has no required fields (codemode.get_server_time({}), never codemode.get_server_time()).

Example: async () => { const r = await codemode.entity_list({ type: "contact" }); return r.entities.filter(e => !e.fields.email).map(e => e.name); }

Return only what the user needs — intermediate data stays in the sandbox.`

export interface BuildCodeModeToolOptions {
  /** The fully-assembled chat toolset to expose (filtered internally). */
  tools: ToolSet
  loader: WorkerLoader
  /** Sandbox execution timeout. Default 60s (executor default). */
  timeoutMs?: number
}

/**
 * Build the `code_mode` tool from the already-bound chat toolset. Call
 * AFTER the toolset is assembled (chat + MCP tools, execute functions
 * bound to the user's context) and BEFORE find_tools snapshots the
 * catalog, so code_mode is itself discoverable.
 */
export function buildCodeModeTool(options: BuildCodeModeToolOptions): Tool {
  // Per-turn tool-call budget (brains-trust 2026-07-18): without it,
  // generated code could Promise.all() an unbounded burst of RPC-dispatched
  // tool calls (web_search × 50) inside the 60s window. The counter spans
  // all code_mode executions in the turn — the build runs per turn.
  let callsUsed = 0
  const MAX_CALLS_PER_TURN = 40

  const exposed: ToolSet = {}
  for (const [name, t] of Object.entries(options.tools)) {
    if (!ALLOWED_NAMES.has(name)) continue
    const orig = (t as { execute?: (...a: unknown[]) => Promise<unknown> }).execute
    if (!orig) continue
    exposed[name] = {
      ...t,
      execute: async (...args: unknown[]) => {
        callsUsed += 1
        if (callsUsed > MAX_CALLS_PER_TURN) {
          throw new Error(
            `code_mode tool-call budget exhausted (${MAX_CALLS_PER_TURN} calls this turn). ` +
              'Reduce the number of tool calls in your composition.'
          )
        }
        return orig(...args)
      },
    } as ToolSet[string]
  }

  const executor = new DynamicWorkerExecutor({
    loader: options.loader,
    timeout: options.timeoutMs ?? 60_000,
    // Explicit even though it's the default: sandbox gets no network.
    globalOutbound: null,
  })

  const codeTool = createCodeTool({
    tools: [aiTools(exposed)],
    executor,
    description: DESCRIPTION,
  })

  // The types block is the whole cost of having this tool active —
  // surface it so deployments can weigh it against find_tools round-trips.
  console.log(
    JSON.stringify({
      event: 'code_mode_built',
      exposedTools: Object.keys(exposed).length,
      descriptionChars: codeTool.description?.length ?? 0,
    })
  )

  // codemode's runCode THROWS on sandbox failures (including zod
  // validation of a composed tool's args — e.g. the model passing an
  // empty search query). A thrown tool error kills the whole chat
  // stream; a returned one becomes tool output the model can read and
  // self-correct from. Live-observed: `q: ""` → turn died. Wrap it.
  const innerExecute = codeTool.execute?.bind(codeTool)
  if (innerExecute) {
    // Cast: the SDK's execute union includes AsyncIterable (streaming
    // tools); createCodeTool's is promise-only, and so is the wrapper.
    codeTool.execute = (async (input: { code: string }, callOpts: unknown) => {
      try {
        const out = await innerExecute(input, callOpts as Parameters<typeof innerExecute>[1])
        // The composition's return value bypasses toAiSdkTool's truncation
        // gate (this tool isn't a ToolDefinition), so cap it here — an
        // unbounded aggregate would flood the transcript context.
        if (out && typeof out === 'object' && 'result' in out) {
          try {
            const serialized = JSON.stringify(out.result)
            if (serialized && serialized.length > 30_000) {
              return {
                ...out,
                result: {
                  truncated: true,
                  preview: serialized.slice(0, 30_000),
                  note: 'Result exceeded 30KB and was truncated. Return a smaller summary from your code instead of raw aggregates.',
                },
              }
            }
          } catch {
            /* non-serialisable — let it through; the SDK will handle it */
          }
        }
        return out
      } catch (err) {
        // Error travels inside CodeOutput's `result` field so the wrapped
        // execute stays type-compatible with the SDK's signature.
        return {
          result: {
            error: err instanceof Error ? err.message : String(err),
            hint: 'Fix the code (check argument constraints in the type signatures) and call code_mode again.',
          },
        }
      }
    }) as typeof codeTool.execute
  }

  return codeTool as Tool
}
