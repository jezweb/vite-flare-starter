/**
 * Delegate Tool — spawn a focused subagent for a specific task
 *
 * Useful when:
 * - The current context is getting heavy and a side-task can run cheaply
 * - You want a specialist with a narrow system prompt for one job
 * - Multiple parallel investigations would speed up an answer
 *
 * The subagent gets its own context (no parent message history) so it
 * stays focused and doesn't pollute the main conversation.
 */
import { tool, generateText } from 'ai'
import { z } from 'zod'
import { resolveModel } from '@/server/lib/ai/providers'
import { buildModel } from '@/server/lib/ai/middleware'

interface DelegateEnv {
  AI: Ai
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_AI_API_KEY?: string
  OPENROUTER_API_KEY?: string
}

interface DelegateContext {
  env: DelegateEnv
  /** Default model if subagent doesn't specify */
  defaultModel: string
}

export function buildDelegateTool(ctx: DelegateContext) {
  return {
    delegate: tool({
      description: "Delegate a focused task to a subagent. Use for: research that needs its own context, parallel investigations, narrow specialist tasks (summarising, classifying, extracting). The subagent runs with no message history — give it everything it needs in the prompt.",
      inputSchema: z.object({
        role: z.string().describe('What kind of agent (e.g. "researcher", "summariser", "code reviewer")'),
        prompt: z.string().describe('The task — full instructions and any context the subagent needs'),
        model: z.string().optional().describe('Override the model (e.g. "@cf/meta/llama-3.1-8b-instruct" for a fast cheap subagent)'),
      }),
      execute: async ({ role, prompt, model }) => {
        try {
          const modelId = model || ctx.defaultModel
          const baseModel = resolveModel(ctx.env, modelId)
          const wrappedModel = buildModel(baseModel, modelId)

          const { text, usage } = await generateText({
            model: wrappedModel,
            system: `You are a ${role}. Complete the task you're given concisely. Return only the result — no preamble, no meta-commentary.`,
            prompt,
            maxOutputTokens: 4000,
          })

          return {
            role,
            model: modelId,
            result: text,
            tokens: { input: usage?.inputTokens, output: usage?.outputTokens },
          }
        } catch (error) {
          return { role, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
