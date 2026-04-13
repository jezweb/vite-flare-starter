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

interface ChatToolsContext {
  env: {
    DB: D1Database
    FILES?: R2Bucket
    SKILLS?: R2Bucket
    CLOUDFLARE_ACCOUNT_ID?: string
    CLOUDFLARE_API_TOKEN?: string
    SEARCH_PROVIDER?: string
    SERPER_API_KEY?: string
    BRAVE_API_KEY?: string
    TAVILY_API_KEY?: string
    EXA_API_KEY?: string
  }
  userId: string
}

/**
 * Build the full chat toolkit based on what's available in the environment.
 * Tools that require missing bindings are silently omitted.
 */
export function buildChatTools(ctx: ChatToolsContext) {
  const tools: Record<string, unknown> = {
    ...coreTools,
    ...uiTools,
    ...buildMemoryTools({ db: ctx.env.DB, userId: ctx.userId }),
    ...buildSkillsTools({ env: ctx.env }),
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

export { coreTools, uiTools, buildBrowserTools, buildSearchTools, buildMemoryTools, buildFileTools, buildSkillsTools }
