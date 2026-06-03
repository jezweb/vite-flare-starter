/**
 * AgentContext — the single object threaded through every tool execution.
 *
 * Replaces the ad-hoc `{env, userId, user, ...}` bags previously passed to
 * each `build*Tools(ctx)` factory. A new tool declares its required
 * capabilities via its `isAvailable(ctx)` check against this shape, and
 * its `execute(input, ctx)` receives it at call time.
 *
 * This context is kept PURE DATA — no methods. Behaviour (telemetry,
 * logging) lives on discrete interface fields so tools remain testable
 * with a stubbed context.
 */
import type { TelemetrySink } from './telemetry'

/**
 * Minimal Env shape needed across tools. Projects that add new bindings
 * can widen this intersection type in `src/server/env.ts` (if present) or
 * redeclare with a local narrower type — the ToolDefinition<I,O> contract
 * only requires the tool's OWN needed bindings at call time.
 *
 * We deliberately keep this loose here so the shared/ module stays free
 * of Cloudflare type imports that the client wouldn't need at build time.
 */
export type AgentEnv = Record<string, unknown>

export interface AgentUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
  role: 'user' | 'manager' | 'admin'
}

export interface AgentModel {
  /** Full model id (e.g. "anthropic/claude-sonnet-4-6"). */
  id: string
  /** Broad category for provider-specific behaviour. */
  provider: 'workers-ai' | 'openrouter' | 'anthropic' | 'openai' | 'google' | 'other'
  supportsVision: boolean
  supportsTools: boolean
}

export interface AgentContext {
  env: AgentEnv
  userId: string
  user: AgentUser
  /** Set when the request is tied to an existing stored conversation. */
  conversationId?: string
  /** Set when the conversation belongs to a project (server-resolved). */
  projectId?: string | null
  /** Resolved model metadata for this request. */
  model: AgentModel
  telemetry: TelemetrySink
  /** Plumbed from the HTTP request so long-running tools can abort. */
  signal?: AbortSignal
  /**
   * Recursion depth for agents-calling-agents (the `delegate` tool).
   * Top-level request → 0. A delegate call → 1. Nested delegate → 2.
   * Caps defined by the delegate tool itself.
   */
  depth?: number
}
