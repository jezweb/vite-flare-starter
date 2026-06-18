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

export async function buildChatTools(
  ctx: AgentContext,
  options: { availableSkillNames?: string[] } = {}
) {
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

  // Fork-level catalogue scoping (#74). A focused fork (e.g. an HR advisor)
  // wants the agent to see only a relevant subset — a large catalogue actively
  // degrades the free Workers AI models the starter defaults to (they wander
  // into irrelevant tools). Set via env, no shared-file edit:
  //   CHAT_TOOLS_INCLUDE="core_*,knowledge_*,web_search"  → allowlist (only these)
  //   CHAT_TOOLS_EXCLUDE="slack_*,notion_*,image_*"        → denylist (drop these)
  // Entries match a tool name exactly, or as a prefix when ending in '*'.
  // Include is applied first (when set), then exclude.
  const scoped = scopeToolsByEnv(allDefinitions, ctx.env as Record<string, unknown>)

  // Per-user connector filter — keeps connector tools the user has
  // opted into, passes built-in tools through untouched. Preserves
  // current behaviour when the user has no settings rows (defaults
  // include the read-only subset of each provider).
  const allowed = await getAllowedConnectorTools(
    ctx.env as unknown as ConnectorSettingsEnv,
    ctx.userId
  )
  const filtered = filterToolsByUserSettings(scoped, allowed)

  return await collectAvailableTools(filtered, ctx)
}

/**
 * Apply the optional CHAT_TOOLS_INCLUDE / CHAT_TOOLS_EXCLUDE env allow/deny
 * lists to the tool catalogue. Each comma-separated entry matches a tool name
 * exactly, or as a prefix when it ends in '*' (e.g. `gmail_*`). No env set →
 * returns the list unchanged (current behaviour).
 */
function scopeToolsByEnv(
  definitions: ToolDefinition<unknown, unknown>[],
  env: Record<string, unknown>
): ToolDefinition<unknown, unknown>[] {
  const parse = (raw: unknown): string[] =>
    typeof raw === 'string'
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  const include = parse(env['CHAT_TOOLS_INCLUDE'])
  const exclude = parse(env['CHAT_TOOLS_EXCLUDE'])
  if (include.length === 0 && exclude.length === 0) return definitions

  const matches = (name: string, pattern: string): boolean =>
    pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern

  let result = definitions
  if (include.length > 0) {
    result = result.filter((d) => include.some((p) => matches(d.name, p)))
  }
  if (exclude.length > 0) {
    result = result.filter((d) => !exclude.some((p) => matches(d.name, p)))
  }
  return result
}

// Legacy re-exports for anything that still imports the old names.
// Planned removal: once all callers migrate.
export { getActiveSearchProvider } from './search'
