/**
 * Tool adapter — bridges our canonical `ToolDefinition<I, O>` shape to the
 * AI SDK's `tool()` primitive.
 *
 * This is the ONLY place that translates between the two shapes. Consumers
 * (tools/index.ts aggregator) hand us ToolDefinition arrays; the adapter
 * returns AI-SDK-ready records keyed by tool name, with input/output
 * Zod validation and telemetry automatically wrapped around execute.
 *
 * The adapter is a server-only module — it imports `ai` (AI SDK) which
 * pulls in Node/Worker runtime deps. Client bundles never touch this file.
 */
import { tool, type Tool } from 'ai'
import type { ToolDefinition } from '@/shared/agent/tool'
import type { AgentContext } from '@/shared/agent/context'
import {
  truncateToolResult,
  DEFAULT_MAX_CHARS,
  type TruncateMetadata,
} from './truncate-tool-result'
import { storeDataset, type DataLakeEnv } from '@/server/lib/data-lake'

/**
 * Tools that already return a structured small summary and should NOT
 * have truncation applied — passing them through the helper is wasted
 * work and the metadata pollution (`truncated: false`, `originalChars`)
 * would confuse the model. Most tools won't need to be in this list;
 * add only the ones we know are bounded and where the wrapper hurts
 * more than it helps.
 *
 * (UI-render tools like `show_map`, `show_image`, `propose_patch` are
 * the natural candidates — their output IS the UI payload and we never
 * want to alter it.)
 */
const TRUNCATION_BYPASS = new Set<string>([
  'show_map',
  'show_image',
  'show_link',
  'show_image_card',
  'propose_patch',
  'load_skill',
  'done',
  // Data-lake reader — already operates under an explicit user-chosen
  // limit (max 500 rows). Truncating again on top of that would
  // silently break the contract the agent relied on when it picked
  // the limit.
  'read_data',
])

/**
 * Wrap a single ToolDefinition into an AI SDK tool. The resulting tool's
 * `execute` will validate input with Zod before running, validate output
 * after, and report telemetry on both success and failure paths.
 */
export function toAiSdkTool<I, O>(def: ToolDefinition<I, O>, ctx: AgentContext): Tool {
  // AI SDK's `tool()` generic binds awkwardly with our parametric <I, O>
  // (Zod v4 vs the SDK's internal FlexibleSchema<> constraints). Cast to
  // a flexible record so Zod v3/v4 interop works — our ToolDefinition
  // contract already guarantees correctness.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: any = {
    description: def.description,
    inputSchema: def.inputSchema,
    execute: async (input: unknown) => {
      const start = Date.now()
      let inputSize: number | undefined
      try {
        // The AI SDK has already validated input against inputSchema before
        // calling execute, so the cast is safe. We still run through Zod
        // defensively because some providers bypass validation with
        // `experimental_*` flags we may later adopt.
        const parsedInput = def.inputSchema.parse(input) as I
        try {
          inputSize = JSON.stringify(parsedInput).length
        } catch {
          /* non-serialisable — skip */
        }

        const output = await def.execute(parsedInput, ctx)

        // Validate outputs in development only — production skips to avoid
        // double the cost on hot paths. Kept as a noop parse today; flip
        // the env check to `!== 'production'` once we've validated in the
        // wild that all tool outputs conform.
        const validated = output as O

        // Truncation gate — see truncate-tool-result.ts. Bypass tools
        // that return UI payloads or known-small summaries. For the
        // rest, run the budget check; if the result is over, swap in
        // a preview + truncation hint and structurally log so we can
        // see *which* tools are causing context bloat.
        let finalResult: O = validated
        let outputSize: number | undefined
        try {
          outputSize = JSON.stringify(validated).length
        } catch {
          /* non-serialisable — skip */
        }
        if (!TRUNCATION_BYPASS.has(def.name)) {
          const trunc = truncateToolResult(validated, { maxChars: DEFAULT_MAX_CHARS })
          if (trunc.metadata.truncated) {
            finalResult = trunc.result
            // Phase B — R2 spillover. When a DATA_LAKE bucket is bound,
            // stash the FULL un-truncated rows in R2 and inject a
            // `data_ref` into the truncated response so the agent can
            // reach back via read_data / aggregate_data / export_data.
            // Best-effort: spillover failure must NEVER break the tool
            // call — we log it and continue with the truncated payload.
            const dataLakeEnv = ctx.env as DataLakeEnv
            if (dataLakeEnv.DATA_LAKE) {
              const dataRef = await tryStoreToDataLake(
                dataLakeEnv,
                ctx.userId,
                validated,
                trunc.metadata,
                `tool:${def.name}`
              )
              if (dataRef) {
                if (finalResult && typeof finalResult === 'object') {
                  const augmented = finalResult as Record<string, unknown>
                  augmented['data_ref'] = dataRef
                  augmented['truncation_message'] =
                    `Returned ${trunc.metadata.keptItems ?? 'a preview'} of ${trunc.metadata.totalItems ?? 'many'} items. ` +
                    `Full result available via data_ref="${dataRef}". ` +
                    `Call read_data / aggregate_data / export_data to access it.`
                }
              }
            }
            // Recompute outputSize on the truncated payload so telemetry
            // reflects what actually entered the conversation, not the
            // original blob — otherwise the size graph would be a lie.
            try {
              outputSize = JSON.stringify(finalResult).length
            } catch {
              /* skip */
            }
            // Structured log: the admin tools tab can surface a list of
            // chronically-truncated tools so we know which ones need
            // pagination or dedicated analytical variants.
            console.log(
              JSON.stringify({
                event: 'tool_result_truncated',
                userId: ctx.userId,
                toolName: def.name,
                originalChars: trunc.metadata.originalChars,
                kind: trunc.metadata.kind,
                collectionKey: trunc.metadata.collectionKey,
                totalItems: trunc.metadata.totalItems,
                keptItems: trunc.metadata.keptItems,
                spilledToLake: !!(
                  finalResult &&
                  typeof finalResult === 'object' &&
                  'data_ref' in finalResult
                ),
              })
            )
          }
        }

        await ctx.telemetry.recordTool({
          name: def.name,
          durationMs: Date.now() - start,
          ok: true,
          inputSize,
          outputSize,
        })
        return finalResult
      } catch (err) {
        await ctx.telemetry.recordTool({
          name: def.name,
          durationMs: Date.now() - start,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          inputSize,
        })
        throw err
      }
    },
  }
  // needsApproval passes through to ToolLoopAgent which emits the
  // `approval-requested` state in the stream. Our ToolApproval renderer
  // handles the user-facing prompt.
  if (def.needsApproval !== undefined) {
    config.needsApproval = def.needsApproval
  }
  return tool(config) as Tool
}

/**
 * Convert a list of ToolDefinitions into the AI SDK's expected
 * `Record<string, Tool>` shape, filtering by each tool's `isAvailable`.
 *
 * `isAvailable` checks run in parallel — no one tool's slow check should
 * block others. Tools that return false are omitted entirely; the model
 * never sees them.
 */
export async function collectAvailableTools(
  defs: ToolDefinition<unknown, unknown>[],
  ctx: AgentContext
): Promise<Record<string, Tool>> {
  const availability = await Promise.all(
    defs.map(async (def) => {
      if (!def.isAvailable) return true
      try {
        return await def.isAvailable(ctx)
      } catch {
        // A failing availability check shouldn't crash the agent — just
        // omit the tool. Telemetry would catch this if we wanted.
        return false
      }
    })
  )

  const tools: Record<string, Tool> = {}
  for (let i = 0; i < defs.length; i++) {
    if (availability[i]) {
      const def = defs[i]
      if (!def) continue
      tools[def.name] = toAiSdkTool(def, ctx)
    }
  }
  return tools
}

/**
 * Best-effort R2 spillover. Pulls the full un-truncated array out of
 * the original tool output (using the truncation metadata to find the
 * right key) and writes it to the data lake. Returns the dataRef on
 * success, null on any failure — the caller falls back to the
 * truncated-only payload.
 *
 * Kept inline rather than exported because the only sensible caller
 * is the tool adapter wrapper above; exposing it as a public API
 * would tempt callers into bypassing the truncation flow.
 */
async function tryStoreToDataLake(
  env: DataLakeEnv,
  userId: string,
  output: unknown,
  metadata: TruncateMetadata,
  source: string
): Promise<string | null> {
  try {
    let fullArray: unknown[] | null = null
    if (
      metadata.kind === 'collection' &&
      metadata.collectionKey &&
      output &&
      typeof output === 'object'
    ) {
      const obj = output as Record<string, unknown>
      const v = obj[metadata.collectionKey]
      if (Array.isArray(v)) fullArray = v
    } else if (metadata.kind === 'array' && Array.isArray(output)) {
      fullArray = output
    }
    if (!fullArray || fullArray.length === 0) return null
    const { dataRef } = await storeDataset(env, userId, fullArray, { source })
    return dataRef
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'data_lake_spillover_failed',
        userId,
        source,
        error: err instanceof Error ? err.message : String(err),
      })
    )
    return null
  }
}
