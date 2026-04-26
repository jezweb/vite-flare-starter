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
import { tokenBudgetPrepareStep, computeActiveTools } from './prepare-step'
import {
  buildFindToolsTool,
  CORE_TOOL_NAMES,
  extractDiscoveredToolNames,
  type SearchableTool,
} from './tool-search'
import { toAiSdkTool } from './tool-adapter'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { resolveModelForUser } from './providers'
import { costFor } from './cost'
import { buildModel } from './middleware'
import { buildSystemPrompt } from './context'
import { getMCPTools } from './mcp'
import { getModel, DEFAULT_MODEL } from './models'
import { listSkills } from './skills/registry'
import { buildChatTools } from '@/server/modules/chat/tools'
import { aiUsageLogs } from '@/server/modules/chat/db/schema'
import { userMeta } from '@/server/modules/user-meta/db/schema'
import { projects } from '@/server/modules/projects/db/schema'
import type { AgentContext as CanonicalAgentContext, AgentUser } from '@/shared/agent'
import { nullTelemetry } from '@/shared/agent'

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
  // BYOK-aware: user/org credentials override env defaults when set.
  // Worker AI ids are unaffected (no key needed).
  const baseModel = await resolveModelForUser(
    ctx.env as Parameters<typeof resolveModelForUser>[0],
    { userId: ctx.userId },
    modelId,
  )
  const model = buildModel(baseModel, modelId)

  // Load skill catalog for system prompt injection (Level 1 progressive disclosure).
  // Skills with `disable_model_invocation: true` are user-invocable only, so
  // they're hidden from this catalog per the agentskills.io spec — the model
  // shouldn't discover or auto-load them.
  const availableSkills = (
    await listSkills(
      ctx.env as { DB: D1Database; SKILLS?: R2Bucket },
      ctx.userId,
    )
  ).filter((s) => !s.disableModelInvocation)
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
    // Canonical AgentContext threaded through every tool execute().
    const agentUser: AgentUser = {
      id: ctx.userId,
      email: ctx.user?.email ?? '',
      name: ctx.user?.name ?? null,
      role: (ctx.user?.role as 'user' | 'manager' | 'admin' | undefined) ?? 'user',
    }
    const agentCtx: CanonicalAgentContext = {
      env: ctx.env as unknown as Record<string, unknown>,
      userId: ctx.userId,
      user: agentUser,
      projectId: ctx.projectId ?? null,
      model: {
        id: modelId,
        provider: 'other',
        supportsVision: modelConfig.supportsVision ?? false,
        supportsTools: modelConfig.supportsTools ?? true,
      },
      telemetry: nullTelemetry,
    }
    const chatTools = await buildChatTools(agentCtx, {
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

    // Tool Search — inject find_tools and let prepareStep gate the
    // rest behind it. The agent sees ~10 always-active tools (core
    // utilities + UI + find_tools); everything else loads on
    // discovery via find_tools(query). Saves 8-12K input tokens per
    // turn when the catalog is fully loaded (chat tools + per-user
    // MCPs + entity tools).
    //
    // Build the searchable catalog from the FULL toolset BEFORE
    // adding find_tools itself (don't list find_tools as a search
    // result; it's always visible).
    const searchCatalog: SearchableTool[] = Object.entries(tools).map(
      ([name, tool]) => ({
        name,
        description: typeof tool === 'object' && tool && 'description' in tool && typeof tool.description === 'string'
          ? tool.description
          : name,
      }),
    )
    const findTools = buildFindToolsTool(searchCatalog)
    tools['find_tools'] = toAiSdkTool(findTools as unknown as Parameters<typeof toAiSdkTool>[0], agentCtx)
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
        // 1. Token budget check — strips all tools if we're over budget.
        const budgetResult = budgetCheck(opts) as PrepareStepResult
        if (budgetResult && 'activeTools' in budgetResult && Array.isArray(budgetResult.activeTools) && budgetResult.activeTools.length === 0) {
          return budgetResult
        }
        // 2. Tool Search + privileged-op gating combined. Visible tools
        //    per step = (CORE_TOOL_NAMES ∪ discovered-via-find_tools ∪
        //    already-used) ∩ (privileged-unlocked).
        //
        //    Discovered names extracted from the agent's step history
        //    by reading prior find_tools tool results.
        //
        //    Forks that want the legacy "all tools always visible"
        //    behaviour: omit `coreToolNames`. The privileged-tool gate
        //    still applies.
        const discovered = extractDiscoveredToolNames(opts.steps as Parameters<typeof extractDiscoveredToolNames>[0])
        const activeTools = computeActiveTools(tools, opts.messages, opts.steps, {
          coreToolNames: CORE_TOOL_NAMES,
          discoveredToolNames: discovered,
        })
        if (activeTools.length !== Object.keys(tools).length) {
          return { activeTools } as PrepareStepResult
        }
        return {}
      } catch {
        return {} // Fail open — don't crash the agent loop
      }
    },
    // Single-retry repair for malformed tool calls. Smaller models
    // (Gemma, Qwen) occasionally emit invalid JSON for tool args; rather
    // than hard-failing the step, we log the error structurally so it
    // surfaces in the admin Tool Errors tab and let the agent continue
    // (the model sees the failure and can either retry or give up).
    //
    // Returning `null` tells the SDK to emit the original parse error,
    // which is what we want — we're not yet invoking another LLM call
    // for the repair (that's a bigger change with cost implications).
    experimental_repairToolCall: async ({ toolCall, error }) => {
      console.log(
        JSON.stringify({
          event: 'tool_call_repair',
          userId: ctx.userId,
          model: modelId,
          toolName: toolCall.toolName,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      )
      return null
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
        const inputTokens = usage.inputTokens ?? 0
        const outputTokens = usage.outputTokens ?? 0
        await db.insert(aiUsageLogs).values({
          userId: ctx.userId,
          model: modelId,
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
          durationMs: Date.now() - startTime,
          // Catalogue-derived USD cost; null for Workers AI / unknown
          // ids. Cost reports become a SQL SUM(cost_usd) instead of a
          // join + JS price walk.
          costUsd: costFor(modelId, inputTokens, outputTokens),
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
