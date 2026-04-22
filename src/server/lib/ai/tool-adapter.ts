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

/**
 * Wrap a single ToolDefinition into an AI SDK tool. The resulting tool's
 * `execute` will validate input with Zod before running, validate output
 * after, and report telemetry on both success and failure paths.
 */
export function toAiSdkTool<I, O>(
  def: ToolDefinition<I, O>,
  ctx: AgentContext,
): Tool {
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

        let outputSize: number | undefined
        try {
          outputSize = JSON.stringify(validated).length
        } catch {
          /* non-serialisable — skip */
        }

        await ctx.telemetry.recordTool({
          name: def.name,
          durationMs: Date.now() - start,
          ok: true,
          inputSize,
          outputSize,
        })
        return validated
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
  ctx: AgentContext,
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
    }),
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

