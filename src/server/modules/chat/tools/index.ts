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
import { buildSemanticSearchTools } from './search-semantic'
import { buildImageTools } from './image'
import { buildImageTransformTools } from './image-transform'
import { buildMediaTools } from './media'
import { buildSessionTools } from './session'
import { buildPlacesTools } from './places'
import { buildEmailTools } from './email'

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
    GOOGLE_PLACES_API_KEY?: string
    VECTORS?: VectorizeIndex
    // Email bindings — at least one enables the send_email agent tool.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    EMAIL?: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SEND_EMAIL?: any
    EMAIL_API_KEY?: string
    EMAIL_FROM?: string
    APP_NAME?: string
    APP_URL?: string
    BETTER_AUTH_URL?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IMAGES?: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MEDIA?: any
  }
  userId: string
  /** Optional — populated when we know the caller's email/name for
   *  send_email Reply-To and agent-tool signing. */
  userEmail?: string
  userName?: string
  defaultModel: string
  /**
   * Names of skills available this session — used to constrain load_skill's
   * `name` parameter to a Zod enum so the model can't invent skill names.
   * Per agentskills.io client-implementation guide (Step 4).
   */
  availableSkillNames?: string[]
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
    ...buildSkillsTools({ env: ctx.env, userId: ctx.userId, availableSkillNames: ctx.availableSkillNames }),
    ...buildCodeTools({ env: ctx.env, userId: ctx.userId }),
    ...buildDelegateTool({ env: ctx.env as Parameters<typeof buildDelegateTool>[0]['env'], defaultModel: ctx.defaultModel, userId: ctx.userId }),
    ...buildAudioTools({ env: ctx.env }),
    ...buildTodoTools({ db: ctx.env.DB, userId: ctx.userId }),
    ...buildScheduleTools({ db: ctx.env.DB, userId: ctx.userId }),
    ...buildSessionTools({ db: ctx.env.DB, userId: ctx.userId }),
    ...buildSemanticSearchTools({ env: ctx.env as unknown as Parameters<typeof buildSemanticSearchTools>[0]['env'], userId: ctx.userId }),
  }

  if (ctx.env.CLOUDFLARE_ACCOUNT_ID && ctx.env.CLOUDFLARE_API_TOKEN) {
    Object.assign(tools, buildBrowserTools(ctx.env))
  }

  if (getActiveSearchProvider(ctx.env)) {
    Object.assign(tools, buildSearchTools(ctx.env))
  }

  Object.assign(tools, buildPlacesTools(ctx.env))

  // send_email — only included when an email provider is configured.
  // Guarded with needsApproval:true so the UI prompts before sending.
  Object.assign(
    tools,
    buildEmailTools({
      env: ctx.env,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      userName: ctx.userName,
    }),
  )

  if (ctx.env.FILES) {
    Object.assign(tools, buildFileTools({ bucket: ctx.env.FILES, userId: ctx.userId }))
    Object.assign(tools, buildImageTools({ env: ctx.env as Parameters<typeof buildImageTools>[0]['env'], userId: ctx.userId }))
    Object.assign(tools, buildImageTransformTools({ env: ctx.env as Parameters<typeof buildImageTransformTools>[0]['env'], userId: ctx.userId }))
    Object.assign(tools, buildMediaTools({ env: ctx.env as Parameters<typeof buildMediaTools>[0]['env'], userId: ctx.userId }))
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
  buildPlacesTools,
  buildEmailTools,
}
