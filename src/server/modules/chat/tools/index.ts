/**
 * Chat Tools — aggregated toolkit
 *
 * Call buildChatTools(ctx) to get the full toolkit. Tools that require
 * specific bindings are conditionally included based on what's available.
 */
import { coreTools } from './core'
import { buildBrowserTools } from './browser'
import { buildSearchTools, getActiveSearchProvider } from './search'
import { buildMemoryTools } from './memory'
import { buildFileTools } from './files'
import { uiTools } from './ui'
import { buildSkillsTools } from './skills'
import { buildCodeTools } from './code'
import { buildDelegateTool } from './delegate'
import { buildAudioTools } from './audio'
import { buildTodoTools } from './todo'
import { buildScheduleTools } from './schedule'
import { artifactTools } from './artifacts'
import { buildDocumentTools } from './documents'

interface ChatToolsContext {
  env: {
    AI: Ai
    DB: D1Database
    FILES?: R2Bucket
    SKILLS?: R2Bucket
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SANDBOX?: any
    CLOUDFLARE_ACCOUNT_ID?: string
    CLOUDFLARE_API_TOKEN?: string
    SEARCH_PROVIDER?: string
    SERPER_API_KEY?: string
    BRAVE_API_KEY?: string
    TAVILY_API_KEY?: string
    EXA_API_KEY?: string
    ANTHROPIC_API_KEY?: string
    OPENAI_API_KEY?: string
    GOOGLE_AI_API_KEY?: string
    OPENROUTER_API_KEY?: string
  }
  userId: string
  defaultModel: string
}

/**
 * Build the full chat toolkit based on what's available in the environment.
 * Tools that require missing bindings are silently omitted.
 *
 * Always present: core, ui, memory, skills, code (returns setup msg if no SANDBOX), delegate
 * Conditional: browser (needs CF API), search (needs provider key), files (needs FILES bucket)
 */
export function buildChatTools(ctx: ChatToolsContext) {
  const tools: Record<string, unknown> = {
    ...coreTools,
    ...uiTools,
    ...artifactTools,
    ...buildDocumentTools({ bucket: ctx.env.FILES, userId: ctx.userId }),
    ...buildMemoryTools({ db: ctx.env.DB, userId: ctx.userId }),
    ...buildSkillsTools({ env: ctx.env }),
    ...buildCodeTools({ env: ctx.env, userId: ctx.userId }),
    ...buildDelegateTool({ env: ctx.env, defaultModel: ctx.defaultModel }),
    ...buildAudioTools({ env: ctx.env }),
    ...buildTodoTools({ db: ctx.env.DB, userId: ctx.userId }),
    ...buildScheduleTools({ db: ctx.env.DB, userId: ctx.userId }),
  }

  if (ctx.env.CLOUDFLARE_ACCOUNT_ID && ctx.env.CLOUDFLARE_API_TOKEN) {
    Object.assign(tools, buildBrowserTools(ctx.env))
  }

  if (getActiveSearchProvider(ctx.env)) {
    Object.assign(tools, buildSearchTools(ctx.env))
  }

  if (ctx.env.FILES) {
    Object.assign(tools, buildFileTools({ bucket: ctx.env.FILES, userId: ctx.userId }))
  }

  return tools
}

export {
  coreTools,
  uiTools,
  buildBrowserTools,
  buildSearchTools,
  buildMemoryTools,
  buildFileTools,
  buildSkillsTools,
  buildCodeTools,
  buildDelegateTool,
  buildAudioTools,
  buildTodoTools,
}
