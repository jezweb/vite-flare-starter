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
import { memoriesMultiDefinitions } from './memories-multi'
import { fileDefinitions } from './files'
import { uiDefinitions } from './ui'
import { skillsDefinitions } from './skills'
import { knowledgeDefinitions } from './knowledge'
import { codeDefinitions } from './code'
import { delegateDefinitions } from './delegate'
import { audioDefinitions } from './audio'
import { todoDefinitions } from './todo'
import { scheduleDefinitions } from './schedule'
import { artifactDefinitions } from './artifacts'
import { documentDefinitions } from './documents'
import { semanticSearchDefinitions } from './search-semantic'
import { imageDefinitions } from './image'
import { imageAnalyzeDefinitions } from './image-analyze'
import { imageEditDefinitions } from './image-edit'
import { imageTransformDefinitions } from './image-transform'
import { mediaDefinitions } from './media'
import { sessionDefinitions } from './session'
import { placesDefinitions } from './places'
import { emailDefinitions } from './email'
import { searchFilesDefinitions } from './search-files'
import { googleWorkspaceDefinitions } from './google-workspace'
import { microsoftWorkspaceDefinitions } from './microsoft-workspace'
import { slackDefinitions } from './slack'
import { notionDefinitions } from './notion'
import { atlassianDefinitions } from './atlassian'
import { proposePatchDefinitions } from './propose-patch'
import { dataDefinitions } from './data'
import { entityDefinitions } from './entities'
import { findingsDefinitions } from './findings'
import { firecrawlDefinitions } from './firecrawl'
import { channelsDefinitions } from './channels'
import { batchTaskDefinitions } from './batch-task'
import { withReviewDefinitions } from './with-review'
import { collectAvailableTools } from '@/server/lib/ai/tool-adapter'
import {
  getAllowedConnectorTools,
  filterToolsByUserSettings,
  type ConnectorSettingsEnv,
} from '@/server/modules/connectors/settings'
import type { AgentContext } from '@/shared/agent'
import type { ToolDefinition } from '@/shared/agent/tool'

export async function buildChatTools(ctx: AgentContext, options: { availableSkillNames?: string[] } = {}) {
  const allDefinitions: ToolDefinition<unknown, unknown>[] = [
    ...coreDefinitions,
    ...memoryDefinitions,
    ...memoriesMultiDefinitions,
    ...todoDefinitions,
    ...uiDefinitions,
    ...artifactDefinitions,
    ...documentDefinitions,
    ...skillsDefinitions(options.availableSkillNames ?? []),
    ...knowledgeDefinitions,
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
    ...imageAnalyzeDefinitions,
    ...imageEditDefinitions,
    ...imageTransformDefinitions,
    ...mediaDefinitions,
    ...googleWorkspaceDefinitions,
    ...microsoftWorkspaceDefinitions,
    ...slackDefinitions,
    ...notionDefinitions,
    ...atlassianDefinitions,
    ...proposePatchDefinitions,
    ...dataDefinitions,
    ...entityDefinitions,
    ...findingsDefinitions,
    ...firecrawlDefinitions,
    ...channelsDefinitions,
    ...batchTaskDefinitions,
    ...withReviewDefinitions,
  ]

  // Per-user connector filter — keeps connector tools the user has
  // opted into, passes built-in tools through untouched. Preserves
  // current behaviour when the user has no settings rows (defaults
  // include the read-only subset of each provider).
  const allowed = await getAllowedConnectorTools(
    ctx.env as unknown as ConnectorSettingsEnv,
    ctx.userId,
  )
  const filtered = filterToolsByUserSettings(allDefinitions, allowed)

  return await collectAvailableTools(filtered, ctx)
}

// Legacy re-exports for anything that still imports the old names.
// Planned removal: once all callers migrate.
export { getActiveSearchProvider } from './search'
