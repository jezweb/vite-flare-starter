/**
 * Chat Tools — aggregated toolkit
 *
 * Every tool is a `ToolDefinition` (see src/shared/agent/tool.ts).
 * The aggregator is a single `collectAvailableTools(allDefinitions, ctx)`
 * call — one composition path, one availability check per tool, one
 * telemetry pipeline.
 *
 * Adding a new tool:
 *   1. Create / edit a domain file in this directory exporting a
 *      `[domain]Definitions` array (or a factory for per-request shape).
 *   2. Import + spread into `allDefinitions` below.
 *
 * That's it. See `.claude/rules/one-file-tool-definitions.md`.
 */
import { coreDefinitions } from './core'
import { browserDefinitions } from './browser'
import { searchDefinitions } from './search'
import { memoryDefinitions } from './memory'
import { fileDefinitions } from './files'
import { uiDefinitions } from './ui'
import { skillsDefinitions } from './skills'
import { codeDefinitions } from './code'
import { delegateDefinitions } from './delegate'
import { audioDefinitions } from './audio'
import { todoDefinitions } from './todo'
import { scheduleDefinitions } from './schedule'
import { artifactDefinitions } from './artifacts'
import { documentDefinitions } from './documents'
import { semanticSearchDefinitions } from './search-semantic'
import { imageDefinitions } from './image'
import { imageTransformDefinitions } from './image-transform'
import { mediaDefinitions } from './media'
import { sessionDefinitions } from './session'
import { placesDefinitions } from './places'
import { emailDefinitions } from './email'
import { searchFilesDefinitions } from './search-files'
import { googleWorkspaceDefinitions } from './google-workspace'
import { collectAvailableTools } from '@/server/lib/ai/tool-adapter'
import type { AgentContext } from '@/shared/agent'
import type { ToolDefinition } from '@/shared/agent/tool'

export async function buildChatTools(ctx: AgentContext, options: { availableSkillNames?: string[] } = {}) {
  const allDefinitions: ToolDefinition<unknown, unknown>[] = [
    ...coreDefinitions,
    ...memoryDefinitions,
    ...todoDefinitions,
    ...uiDefinitions,
    ...artifactDefinitions,
    ...documentDefinitions,
    ...skillsDefinitions(options.availableSkillNames ?? []),
    ...codeDefinitions,
    ...delegateDefinitions,
    ...audioDefinitions,
    ...scheduleDefinitions,
    ...sessionDefinitions,
    ...semanticSearchDefinitions,
    ...searchFilesDefinitions,
    ...placesDefinitions,
    ...emailDefinitions,
    ...searchDefinitions,
    ...browserDefinitions,
    ...fileDefinitions,
    ...imageDefinitions,
    ...imageTransformDefinitions,
    ...mediaDefinitions,
    ...googleWorkspaceDefinitions,
  ]

  return await collectAvailableTools(allDefinitions, ctx)
}

// Legacy re-exports for anything that still imports the old names.
// Planned removal: once all callers migrate.
export { getActiveSearchProvider } from './search'
