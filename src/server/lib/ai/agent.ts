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
  const modelId = ctx.modelId || DEFAULT_MODEL
  const modelConfig = getModel(modelId)
  const startTime = Date.now()

  // Resolve model + apply middleware (reasoning extraction, etc.)
  const baseModel = resolveModel(ctx.env as Parameters<typeof resolveModel>[0], modelId)
  const model = buildModel(baseModel, modelId)

  // Load skill catalog for system prompt injection (Level 1 progressive disclosure)
  const availableSkills = await listSkills(ctx.env as { DB: D1Database; SKILLS?: R2Bucket })
  const skillsCatalog = availableSkills.length > 0
    ? availableSkills.map((s) => `- **${s.name}**: ${s.description}`).join('\n')
    : null

  // Load optional chat preferences from user_meta — set via the settings UI.
  // Stored as JSON under key `chat.preferences` = {preferredName, style, tone}.
  const chatPrefs = await loadChatPreferences(ctx.env.DB, ctx.userId)
  const prefsBlock = chatPrefs ? formatChatPreferences(chatPrefs) : null

  const extraSections: Record<string, string> = {}
  if (skillsCatalog) {
    extraSections['Available Skills'] = `Use the load_skill tool to get full instructions for any of these:\n\n${skillsCatalog}`
  }
  if (prefsBlock) {
    extraSections['User Preferences'] = prefsBlock
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
      defaultModel: modelId,
    })
    const { tools: mcpTools, cleanup } = await getMCPTools(ctx.env)
    mcpCleanup = cleanup
    tools = { ...chatTools, ...mcpTools } as ToolSet
  }

  // Prepare step: token budget tracking
  const budgetCheck = tokenBudgetPrepareStep({ maxTotalTokens: 50000 })

  // Create the agent
  const agent = new ToolLoopAgent({
    model,
    instructions,
    tools,
    stopWhen: modelConfig?.supportsTools ? [stepCountIs(5), hasToolCall('done')] : stepCountIs(1),
    maxOutputTokens: modelConfig?.defaultMaxTokens ?? 16384,
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
  if (p.about) lines.push(`- About the user: ${p.about.slice(0, 500)}`)
  if (p.confirmationMode) {
    lines.push(
      '- Confirmation mode: ON — before calling any tool, briefly describe your plan in one sentence and ask the user to confirm. Only proceed after the user says yes (or equivalent).',
    )
  }
  return lines.join('\n')
}
