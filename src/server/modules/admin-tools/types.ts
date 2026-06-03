/**
 * Shared types for AdminAgent tool factories.
 *
 * Each tool family (routines, awareness, etc.) is a separate file
 * exporting a `build*Tools(args)` factory that takes the agent's
 * `requestApproval` callback + the user/env context. AdminAgent.
 * `getToolDefinitions()` calls each factory and concatenates the result.
 *
 * Pattern mirrors AssistantAgent's per-tool methods, but split into
 * a separate folder so the AdminAgent class file stays readable when
 * the tool count grows.
 */
import type { ToolDefinition } from '@/shared/agent'

export type AdminToolEnv = {
  DB: D1Database
  [key: string]: unknown
}

export interface AdminToolFactoryArgs {
  /** Bound to AutonomousAgent.requestApproval — closes a pending_approval row. */
  requestApproval: (
    action: string,
    payload: unknown,
    summary?: string
  ) => Promise<{ approvalId: string; status: 'pending' }>
  userId: string
  env: AdminToolEnv
}

/** Factory shape returned by every admin-tool family. */
export type AdminToolFactory = (args: AdminToolFactoryArgs) => ToolDefinition<unknown, unknown>[]
