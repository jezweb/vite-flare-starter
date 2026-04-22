/**
 * ToolDefinition — canonical contract for agent tools.
 *
 * Server consumes the full object (including `execute`). Clients import
 * type-only + optionally the `render` metadata. Vite tree-shakes the
 * server-only `execute` code from client bundles because client entry
 * points never reference `.execute`.
 *
 * # Adding a new tool (target architecture — post-Phase 0)
 *
 * 1. Create (or edit) a domain file in src/server/modules/chat/tools/
 *    - Export a `ToolDefinition<I, O>` object
 * 2. Register the definition in src/server/modules/chat/tools/index.ts
 * 3. Optionally add a `render` metadata block (icon, summary, expanded)
 *    for a nice chat UI; omit it to fall through to the generic JSON dump
 *
 * See `.claude/rules/one-file-tool-definitions.md` in the project root
 * for the enforcement rule.
 *
 * # Transitional state
 *
 * During Phase 0 migration, legacy `build*Tools(ctx)` factories that return
 * `Record<string, AiSdkTool>` will coexist with `ToolDefinition[]`-based
 * modules. The aggregator in tools/index.ts consumes both shapes via the
 * adapter in server/lib/ai/tool-adapter.ts.
 */
import type { ZodType } from 'zod'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AgentContext } from './context'

export interface ToolDefinition<TInput, TOutput> {
  /** Canonical snake_case tool name used by the model. */
  name: string
  /** One- or two-line description surfaced to the model. */
  description: string
  inputSchema: ZodType<TInput>
  /**
   * Required. Runtime validation catches provider bugs; type inference
   * flows to client renderers via `z.infer<typeof outputSchema>`.
   */
  outputSchema: ZodType<TOutput>
  /**
   * Per-request availability check. Return false (or resolve false) to
   * omit this tool from the agent's toolkit for the current request.
   * Default: always available.
   */
  isAvailable?: (ctx: AgentContext) => boolean | Promise<boolean>
  /**
   * `true` → always prompt for approval before execute fires.
   * function → per-input decision (e.g. "approve for external recipients only").
   * undefined → no approval step.
   */
  needsApproval?: boolean | ((input: TInput) => boolean)
  /**
   * Main tool logic. Runs on the server with full AgentContext access.
   * The adapter wraps this with Zod validation (input + output) and
   * telemetry before handing to the AI SDK.
   */
  execute: (input: TInput, ctx: AgentContext) => Promise<TOutput>
  /**
   * Client-side rendering metadata. Optional — tools without render info
   * fall back to the generic JSON dump in the ToolCard collapsible.
   *
   * Kept as plain data + React-returning functions so this field can be
   * imported into client bundles without dragging server deps.
   */
  render?: {
    icon?: LucideIcon
    displayName?: string
    /** One-liner shown next to the pill status (e.g. "3 messages"). */
    summary?: (output: TOutput, input: TInput) => string | null
    /** Rich expanded view when the user clicks the tool card. */
    expanded?: (props: { output: TOutput; input: TInput }) => ReactNode
  }
}

/**
 * Type helper: extract the output type from a ToolDefinition. Use in
 * client renderer files as `type Out = ToolOutput<typeof myToolDef>`.
 */
export type ToolOutput<T> = T extends ToolDefinition<unknown, infer O> ? O : never
export type ToolInput<T> = T extends ToolDefinition<infer I, unknown> ? I : never
