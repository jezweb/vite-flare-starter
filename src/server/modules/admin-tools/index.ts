/**
 * AdminAgent tool catalogue — aggregator.
 *
 * Mirrors the shape of `src/server/modules/chat/tools/index.ts`. Each
 * domain (routines, awareness, …) lives in its own file; this module
 * just composes them. AdminAgent imports `buildAdminTools` once.
 */
import type { ToolDefinition } from '@/shared/agent'
import { buildRoutineAdminTools } from './routines'
import { buildAwarenessTools } from './awareness'
import { buildAgentManagementTools } from './agents'
import type { AdminToolFactoryArgs } from './types'

export type { AdminToolFactoryArgs } from './types'

export function buildAdminTools(
  args: AdminToolFactoryArgs,
): ToolDefinition<unknown, unknown>[] {
  return [
    ...buildRoutineAdminTools(args),
    ...buildAwarenessTools(args),
    ...buildAgentManagementTools(args),
  ]
}
