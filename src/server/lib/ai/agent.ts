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
import { resolveModel } from './providers'
import { buildModel } from './middleware'
import { buildSystemPrompt } from './context'
import { getMCPTools } from './mcp'
import { getModel, DEFAULT_MODEL } from './models'
import { listSkills } from './skills/registry'
import { buildChatTools } from '@/server/modules/chat/tools'
import { aiUsageLogs } from '@/server/modules/chat/db/schema'

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

  // Assemble system prompt with user context, date, skills
  const instructions = buildSystemPrompt({
    baseInstructions: ctx.systemPrompt || 'You are a helpful assistant.',
    user: ctx.user ? { name: ctx.user.name, email: ctx.user.email, role: ctx.user.role } : undefined,
    currentDate: true,
    timezone: 'Australia/Sydney',
    extra: skillsCatalog ? {
      'Available Skills': `Use the load_skill tool to get full instructions for any of these:\n\n${skillsCatalog}`,
    } : undefined,
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
    maxOutputTokens: modelConfig?.defaultMaxTokens ?? 2000,
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
