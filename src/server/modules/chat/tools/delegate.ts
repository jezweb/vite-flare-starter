/**
 * Delegate Tool — spawn a focused subagent for a specific task.
 *
 * Uses AI SDK's ToolLoopAgent pattern so subagents can call tools themselves.
 * The subagent runs with isolated context (no parent message history) and
 * returns a compressed text summary to the parent agent.
 *
 * Role-based tool assignment:
 * - "researcher" → gets search + browser definitions
 * - "coder" → gets code execution definitions
 * - Any other role → text-only (no tools)
 */
import { ToolLoopAgent, stepCountIs, readUIMessageStream, type ToolSet } from 'ai'
import { z } from 'zod'
import { UserPlus } from 'lucide-react'
import { resolveModel, type ProviderEnv } from '@/server/lib/ai/providers'
import { buildModel } from '@/server/lib/ai/middleware'
import { collectAvailableTools } from '@/server/lib/ai/tool-adapter'
import { searchDefinitions } from './search'
import { browserDefinitions } from './browser'
import { codeDefinitions } from './code'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

async function getSubagentTools(role: string, ctx: AgentContext): Promise<ToolSet> {
  const roleLower = role.toLowerCase()

  if (roleLower.includes('research') || roleLower.includes('analyst')) {
    return (await collectAvailableTools(
      [...searchDefinitions, ...browserDefinitions] as ToolDefinition<unknown, unknown>[],
      ctx,
    )) as unknown as ToolSet
  }

  if (roleLower.includes('code') || roleLower.includes('developer') || roleLower.includes('programmer')) {
    return (await collectAvailableTools(
      codeDefinitions,
      ctx,
    )) as unknown as ToolSet
  }

  return {}
}

const DelegateOutput = z.union([
  z.object({ role: z.string(), text: z.string() }),
  z.object({ role: z.string(), error: z.string() }),
])

export const delegateDefinition: ToolDefinition<
  { role: string; prompt: string; model?: string },
  z.infer<typeof DelegateOutput>
> = {
  name: 'delegate',
  description:
    "Delegate a focused task to a subagent. Use for: research that needs its own context, parallel investigations, narrow specialist tasks (summarising, classifying, extracting). The subagent runs with no message history — give it everything it needs in the prompt. Researcher subagents can use search and browser tools. Coder subagents can execute code.",
  inputSchema: z.object({
    role: z.string().describe('What kind of agent (e.g. "researcher", "summariser", "code reviewer", "coder")'),
    prompt: z.string().describe('The task — full instructions and any context the subagent needs'),
    model: z.string().optional().describe('Override the default model. Pass any model ID from the available list (Workers AI @cf/... IDs are free, or provider/model for external models). For a fast cheap subagent, pick a Workers AI model.'),
  }),
  outputSchema: DelegateOutput,
  execute: async ({ role, prompt, model }, ctx) => {
    try {
      const modelId = model || ctx.model.id
      const baseModel = resolveModel(ctx.env as unknown as ProviderEnv, modelId)
      const wrappedModel = buildModel(baseModel, modelId)

      // Bump depth so recursive delegations can be capped.
      const childCtx: AgentContext = { ...ctx, depth: (ctx.depth ?? 0) + 1 }
      const subagentTools = await getSubagentTools(role, childCtx)
      const hasTools = Object.keys(subagentTools).length > 0

      const subagent = new ToolLoopAgent({
        model: wrappedModel,
        instructions: `You are a ${role}. Complete the task you're given concisely.\n\nIMPORTANT: Write a clear summary of your findings as your final response. Include all relevant information. No preamble, no meta-commentary.`,
        tools: subagentTools,
        stopWhen: hasTools ? stepCountIs(3) : stepCountIs(1),
        maxOutputTokens: 4000,
      })

      const result = await subagent.stream({
        prompt,
        abortSignal: ctx.signal,
      })

      // Collect the final text from the stream.
      let finalText = 'Subagent completed.'
      for await (const message of readUIMessageStream({ stream: result.toUIMessageStream() })) {
        const parts = (message as { parts?: Array<{ type: string; text?: string }> })?.parts ?? []
        const lastText = [...parts].reverse().find((p) => p.type === 'text')
        if (lastText?.text) finalText = lastText.text
      }
      return { role, text: finalText }
    } catch (error) {
      return { role, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: UserPlus, displayName: 'Delegate' },
}

export const delegateDefinitions = [delegateDefinition] as ToolDefinition<unknown, unknown>[]
