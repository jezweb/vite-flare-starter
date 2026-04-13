/**
 * Delegate Tool — spawn a focused subagent for a specific task
 *
 * Uses AI SDK's ToolLoopAgent pattern so subagents can call tools themselves.
 * The subagent runs with isolated context (no parent message history) and
 * returns a compressed text summary to the parent agent.
 *
 * Role-based tool assignment:
 * - "researcher" → gets search + browser tools
 * - "coder" → gets code execution tools
 * - Any other role → text-only (no tools)
 */
import { tool, ToolLoopAgent, stepCountIs, readUIMessageStream, type ToolSet } from 'ai'
import { z } from 'zod'
import { resolveModel } from '@/server/lib/ai/providers'
import { buildModel } from '@/server/lib/ai/middleware'

interface DelegateEnv {
  AI: Ai
  DB: D1Database
  FILES?: R2Bucket
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_AI_API_KEY?: string
  OPENROUTER_API_KEY?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  SEARCH_PROVIDER?: string
  SERPER_API_KEY?: string
  BRAVE_API_KEY?: string
  TAVILY_API_KEY?: string
  EXA_API_KEY?: string
}

interface DelegateContext {
  env: DelegateEnv
  defaultModel: string
  userId: string
}

/** Build a tool subset for the subagent based on its role */
async function getSubagentTools(role: string, ctx: DelegateContext): Promise<ToolSet> {
  const roleLower = role.toLowerCase()

  // Researcher gets search + browser tools
  if (roleLower.includes('research') || roleLower.includes('analyst')) {
    const tools: ToolSet = {}
    const { buildSearchTools, getActiveSearchProvider } = await import('./search')
    const { buildBrowserTools } = await import('./browser')

    if (getActiveSearchProvider(ctx.env)) {
      Object.assign(tools, buildSearchTools(ctx.env))
    }
    if (ctx.env.CLOUDFLARE_ACCOUNT_ID && ctx.env.CLOUDFLARE_API_TOKEN) {
      Object.assign(tools, buildBrowserTools(ctx.env))
    }
    return tools
  }

  // Coder gets code execution tools
  if (roleLower.includes('code') || roleLower.includes('developer') || roleLower.includes('programmer')) {
    const { buildCodeTools } = await import('./code')
    return buildCodeTools({ env: ctx.env as unknown as Parameters<typeof buildCodeTools>[0]['env'], userId: ctx.userId }) as ToolSet
  }

  // All other roles: text-only (no tools)
  return {}
}

export function buildDelegateTool(ctx: DelegateContext) {
  return {
    delegate: tool({
      description: "Delegate a focused task to a subagent. Use for: research that needs its own context, parallel investigations, narrow specialist tasks (summarising, classifying, extracting). The subagent runs with no message history — give it everything it needs in the prompt. Researcher subagents can use search and browser tools. Coder subagents can execute code.",
      inputSchema: z.object({
        role: z.string().describe('What kind of agent (e.g. "researcher", "summariser", "code reviewer", "coder")'),
        prompt: z.string().describe('The task — full instructions and any context the subagent needs'),
        model: z.string().optional().describe('Override the model (e.g. "@cf/meta/llama-3.1-8b-instruct" for a fast cheap subagent)'),
      }),
      execute: async function* ({ role, prompt, model }, { abortSignal }) {
        try {
          const modelId = model || ctx.defaultModel
          const baseModel = resolveModel(ctx.env, modelId)
          const wrappedModel = buildModel(baseModel, modelId)

          // Build role-appropriate tools for the subagent
          const subagentTools = await getSubagentTools(role, ctx)
          const hasTools = Object.keys(subagentTools).length > 0

          const subagent = new ToolLoopAgent({
            model: wrappedModel,
            instructions: `You are a ${role}. Complete the task you're given concisely.\n\nIMPORTANT: Write a clear summary of your findings as your final response. Include all relevant information. No preamble, no meta-commentary.`,
            tools: subagentTools,
            stopWhen: hasTools ? stepCountIs(3) : stepCountIs(1),
            maxOutputTokens: 4000,
          })

          // Stream subagent progress to the parent UI
          const result = await subagent.stream({
            prompt,
            abortSignal,
          })

          // Yield preliminary messages as the subagent works
          for await (const message of readUIMessageStream({
            stream: result.toUIMessageStream(),
          })) {
            yield message
          }
        } catch (error) {
          yield { role, error: error instanceof Error ? error.message : String(error) }
        }
      },
      // Compress subagent output for parent context — only show final summary text
      toModelOutput: ({ output: message }) => {
        if (!message) return { type: 'text' as const, value: 'Subagent completed.' }
        const parts = (message as { parts?: Array<{ type: string; text?: string }> })?.parts ?? []
        const lastText = [...parts].reverse().find((p: { type: string }) => p.type === 'text')
        return {
          type: 'text' as const,
          value: lastText?.text ?? 'Subagent completed.',
        }
      },
    }),
  }
}
