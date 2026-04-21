/**
 * Chat Agent Factory
 *
 * Creates a configured ToolLoopAgent instance for the chat endpoint.
 * Encapsulates model resolution, system prompt assembly, tool loading,
 * and loop control into a reusable agent definition.
 *
 * @example
 * import { buildChatAgent } from '@/server/lib/ai'
 * import { createAgentUIStreamResponse } from 'ai'
 *
 * const { agent, cleanup } = await buildChatAgent({ env, userId, user, modelId, systemPrompt })
 * return createAgentUIStreamResponse({ agent, uiMessages: messages })
 */
import { ToolLoopAgent, stepCountIs, hasToolCall, type ToolSet, type PrepareStepResult } from 'ai'
import { tokenBudgetPrepareStep } from './prepare-step'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { resolveModel } from './providers'
import { buildModel } from './middleware'
import { buildSystemPrompt } from './context'
import { getMCPTools } from './mcp'
import { getModel, DEFAULT_MODEL } from './models'
import { listSkills } from './skills/registry'
import { buildChatTools } from '@/server/modules/chat/tools'
import { aiUsageLogs } from '@/server/modules/chat/db/schema'
import { userMeta } from '@/server/modules/user-meta/db/schema'
import { projects } from '@/server/modules/projects/db/schema'

interface AgentContext {
  env: Record<string, unknown> & {
    AI: Ai
    DB: D1Database
    FILES?: R2Bucket
    SKILLS?: R2Bucket
  }
  userId: string
  user?: { name?: string; email?: string; role?: string }
  modelId?: string
  systemPrompt?: string
  /**
   * Conversation's project binding (if any). When set, buildChatAgent loads
   * the project's own system prompt and defaultModel and layers them into
   * the cascade between user About-Me and the chat-level systemPrompt.
   * Server-owned — the client never sends this; the chat route reads it
   * from the stored conversation row.
   */
  projectId?: string | null
}

interface AgentResult {
  agent: ToolLoopAgent<never, ToolSet>
  cleanup: (() => Promise<void>) | undefined
  startTime: number
  modelId: string
}

/**
 * Build a chat agent with all tools, system prompt, and middleware configured.
 *
 * Returns the agent instance plus a cleanup function for MCP connections.
 * The caller is responsible for calling cleanup() after streaming completes.
 */
export async function buildChatAgent(ctx: AgentContext): Promise<AgentResult> {
  // Load the conversation's project (if any) first — its defaultModel feeds
  // into model resolution and its systemPrompt feeds into the cascade. All
  // server-owned: the chat route passes projectId from the stored
  // conversation row, never from the client.
  const project = ctx.projectId
    ? await loadProject(ctx.env.DB, ctx.projectId, ctx.userId)
    : null

  // Model precedence: explicit client choice → project default → user default.
  // DEFAULT_MODEL is the very last fallback (matches what the starter uses
  // when nothing else is set).
  const modelId = ctx.modelId || project?.defaultModel || DEFAULT_MODEL
  const modelConfig = getModel(modelId)
  const startTime = Date.now()

  // Resolve model + apply middleware (reasoning extraction, etc.)
  const baseModel = resolveModel(ctx.env as Parameters<typeof resolveModel>[0], modelId)
  const model = buildModel(baseModel, modelId)

  // Load skill catalog for system prompt injection (Level 1 progressive disclosure).
  // Skills with `disable_model_invocation: true` are user-invocable only, so
  // they're hidden from this catalog per the agentskills.io spec — the model
  // shouldn't discover or auto-load them.
  const availableSkills = (await listSkills(ctx.env as { DB: D1Database; SKILLS?: R2Bucket }))
    .filter((s) => !s.disableModelInvocation)
  // Empty array → no catalog block, no behavioural instructions, and the
  // load_skill tool degrades to free-form string (harmless since nothing
  // is callable). Matches the guide's "if no skills, omit entirely" rule.
  const skillsCatalog = availableSkills.length > 0
    ? availableSkills.map((s) => `- **${s.name}**: ${s.description}`).join('\n')
    : null

  // Load optional chat preferences from user_meta — set via the settings UI.
  // Stored as JSON under key `chat.preferences` = {preferredName, style, tone}.
  const chatPrefs = await loadChatPreferences(ctx.env.DB, ctx.userId)
  const prefsBlock = chatPrefs ? formatChatPreferences(chatPrefs) : null

  const extraSections: Record<string, string> = {}
  if (skillsCatalog) {
    // Behavioural block recommended by agentskills.io — tells the model
    // when to auto-load a skill and how the tool result is structured.
    extraSections['Available Skills'] = [
      'The following skills provide specialised instructions for specific tasks.',
      'When a task matches a skill\'s description, call the load_skill tool with the skill name to load its full instructions.',
      'The tool returns a <skill_content> block; follow its instructions, and use fs tools to load any listed resources on demand.',
      '',
      skillsCatalog,
    ].join('\n')
  }
  if (prefsBlock) {
    extraSections['User Preferences'] = prefsBlock
  }
  // Project instructions — highest-specificity prompt layer (above user
  // About-Me, below the chat-level systemPrompt override). Only appears
  // when the conversation is assigned to a project AND the project has
  // instructions set. We include the project name so the model can
  // reference it naturally ("for the Jezweb website project…").
  if (project?.systemPrompt) {
    const header = project.name ? `Project: ${project.name}` : 'Project instructions'
    extraSections['Project instructions'] = `${header}\n\n${project.systemPrompt}`
  }

  // Assemble system prompt with user context, date, skills, and preferences
  const instructions = buildSystemPrompt({
    baseInstructions: ctx.systemPrompt || 'You are a helpful assistant.',
    user: ctx.user ? { name: ctx.user.name, email: ctx.user.email, role: ctx.user.role } : undefined,
    currentDate: true,
    timezone: 'Australia/Sydney',
    extra: Object.keys(extraSections).length > 0 ? extraSections : undefined,
  })

  // Build toolkit: core tools + conditional modules + MCP tools
  let tools: ToolSet = {}
  let mcpCleanup: (() => Promise<void>) | undefined

  if (modelConfig?.supportsTools) {
    const chatTools = buildChatTools({
      env: ctx.env as Parameters<typeof buildChatTools>[0]['env'],
      userId: ctx.userId,
      userEmail: ctx.user?.email,
      userName: ctx.user?.name,
      defaultModel: modelId,
      availableSkillNames: availableSkills.map((s) => s.name),
    })
    const { tools: mcpTools, cleanup } = await getMCPTools(ctx.env)
    // Per-user MCP connections (Phase 5). Layered over env-configured MCPs
    // so if the user also connects e.g. Gmail via OAuth, their tools sit
    // alongside global ones. Tool names are prefixed by connector id to
    // avoid collisions.
    const { getUserMcpTools } = await import('./user-mcp')
    const userMcp = await getUserMcpTools(
      ctx.env as unknown as Parameters<typeof getUserMcpTools>[0],
      ctx.userId,
    )
    mcpCleanup = async () => {
      await cleanup()
      await userMcp.cleanup()
    }
    tools = { ...chatTools, ...mcpTools, ...userMcp.tools } as ToolSet
  }

  // If a places-capable tool is available (native places_search, or an MCP
  // that exposes one), nudge the agent to pair it with the show_map UI tool
  // so a JSON list of businesses renders as a proper map + cards view.
  const hasPlacesTool = Object.keys(tools).some((t) => {
    const lower = t.toLowerCase()
    return lower === 'places_search' || lower.includes('google_local_places') || lower === 'places'
  })
  let finalInstructions = instructions
  if (hasPlacesTool) {
    finalInstructions += `\n\n## Local business answers\n\nWhen the user asks for local businesses, shops, wreckers, venues, or any places with a location, follow this flow:\n1. Call the places search tool (prefer \`places_search\` when available) with a specific query that includes the suburb/city.\n2. Pass the returned places (top 3-8) to the \`show_map\` tool — include name, lat, lng, address, phone, website, rating, reviewCount, type.\n3. Write a short 1-2 sentence intro above the map ("Best bet first: X specialises in Y"). Do not repeat every business in prose — the map cards already show it.`
  }

  // Prepare step: token budget tracking
  const budgetCheck = tokenBudgetPrepareStep({ maxTotalTokens: 50000 })

  // Anthropic prompt caching via OpenRouter — marks large static content
  // (system prompt + tool definitions) as cacheable so multi-turn chats
  // re-read from cache instead of re-billing the full input. Typical
  // savings are 80%+ on input tokens after the first turn. Workers AI
  // and other providers ignore this field. Direct @ai-sdk/anthropic
  // uses the same `cache_control` shape under `anthropic`.
  // @see https://platform.claude.com/docs/en/build-with-claude/prompt-caching
  const isAnthropic = modelId.includes('anthropic/') || modelId.startsWith('claude-')
  const providerOptions = isAnthropic
    ? {
        openrouter: { cache_control: { type: 'ephemeral' as const } },
        anthropic: { cacheControl: { type: 'ephemeral' as const } },
      }
    : undefined

  // Create the agent
  const agent = new ToolLoopAgent({
    model,
    instructions: finalInstructions,
    tools,
    stopWhen: modelConfig?.supportsTools ? [stepCountIs(5), hasToolCall('done')] : stepCountIs(1),
    maxOutputTokens: modelConfig?.defaultMaxTokens ?? 16384,
    providerOptions,
    prepareStep: (opts) => {
      try {
        return budgetCheck(opts) as PrepareStepResult
      } catch {
        return {} // Fail open — don't crash the agent loop
      }
    },
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'chat-agent',
      metadata: { userId: ctx.userId, model: modelId },
    },
    onFinish: async ({ usage }) => {
      // Clean up MCP connections
      if (mcpCleanup) await mcpCleanup()

      // Log usage to D1
      try {
        const db = drizzle(ctx.env.DB)
        await db.insert(aiUsageLogs).values({
          userId: ctx.userId,
          model: modelId,
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
          durationMs: Date.now() - startTime,
        })
      } catch (err) {
        console.error('Failed to log AI usage:', err)
      }
    },
  })

  return { agent, cleanup: mcpCleanup, startTime, modelId }
}

/**
 * Chat preferences — per-user personalisation that influences the system
 * prompt. Stored in `user_meta['chat.preferences']`. All fields optional.
 */
export interface ChatPreferences {
  preferredName?: string
  /** "concise" | "detailed" — shapes response length guidance */
  style?: 'concise' | 'detailed'
  /** "friendly" | "direct" | "academic" — shapes tone guidance */
  tone?: 'friendly' | 'direct' | 'academic'
  /** Free-form context the user wants the model to know (role, interests, etc.) */
  about?: string
  /** When true: describe the plan and ask for confirmation before calling tools */
  confirmationMode?: boolean
}

/**
 * Load a project row scoped to the user. Scoped by userId to stop cross-user
 * reads if a malicious client ever passes a different user's projectId —
 * though in practice the chat route already resolves projectId from the
 * conversation's server-stored row, so the FK + owner check is redundant
 * belt-and-braces.
 */
async function loadProject(
  db: D1Database,
  projectId: string,
  userId: string,
): Promise<{ name: string; systemPrompt: string | null; defaultModel: string | null } | null> {
  try {
    const row = await drizzle(db)
      .select({
        name: projects.name,
        systemPrompt: projects.systemPrompt,
        defaultModel: projects.defaultModel,
      })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .get()
    return row ?? null
  } catch {
    return null
  }
}

async function loadChatPreferences(
  db: D1Database,
  userId: string,
): Promise<ChatPreferences | null> {
  try {
    const row = await drizzle(db)
      .select({ value: userMeta.value })
      .from(userMeta)
      .where(and(eq(userMeta.userId, userId), eq(userMeta.key, 'chat.preferences')))
      .get()
    if (!row) return null
    const parsed = JSON.parse(row.value) as ChatPreferences
    // Only return if there's at least one non-empty field — otherwise we'd
    // inject an empty section into the system prompt.
    if (!parsed.preferredName && !parsed.style && !parsed.tone && !parsed.about && !parsed.confirmationMode) return null
    return parsed
  } catch {
    return null
  }
}

function formatChatPreferences(p: ChatPreferences): string {
  const lines: string[] = []
  if (p.preferredName) lines.push(`- Preferred name: ${p.preferredName}`)
  if (p.style) {
    lines.push(
      p.style === 'concise'
        ? '- Response style: Concise — keep replies short and focused. Skip preamble.'
        : '- Response style: Detailed — include context, reasoning, and worked examples.',
    )
  }
  if (p.tone) {
    const toneMap: Record<string, string> = {
      friendly: 'warm and conversational',
      direct: 'direct and matter-of-fact; no hedging',
      academic: 'precise and formal, with citations where relevant',
    }
    lines.push(`- Tone: ${toneMap[p.tone] ?? p.tone}`)
  }
  if (p.about) {
    // Free-form user profile. Preserve markdown / line breaks by indenting
    // as a multi-line block rather than a single bullet. Cap at 2000 chars
    // to match the client-side textarea limit.
    const trimmed = p.about.slice(0, 2000).trim()
    lines.push(`- About the user (markdown):\n\n${trimmed}`)
  }
  if (p.confirmationMode) {
    lines.push(
      '- Confirmation mode: ON — before calling any tool, briefly describe your plan in one sentence and ask the user to confirm. Only proceed after the user says yes (or equivalent).',
    )
  }
  return lines.join('\n')
}
