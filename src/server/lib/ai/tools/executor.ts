/**
 * Tool Executor
 *
 * Executes tool calls with AI using @cloudflare/ai-utils.
 * Provides a unified interface for running tools with different models.
 */

import { runWithTools as cfRunWithTools, tool as cfTool } from '@cloudflare/ai-utils'
import type {
  Tool,
  ToolContext,
  ToolCallRequest,
  ToolCallResult,
  ToolExecutor,
  ToolRegistry,
  RunWithToolsOptions,
  RunWithToolsResult,
  WorkersAIBinding,
} from './types'
import { resolveModelId, getRecommendedModel } from '../models'
import { supportsTools } from '../providers'
import type { ModelId, ChatMessage } from '../types'

/**
 * Create a tool executor from a registry
 */
export function createExecutor(registry: ToolRegistry): ToolExecutor {
  return {
    async execute(
      call: ToolCallRequest,
      context: ToolContext
    ): Promise<ToolCallResult> {
      const startTime = Date.now()

      const tool = registry.get(call.name)
      if (!tool) {
        return {
          name: call.name,
          result: null,
          success: false,
          error: `Tool not found: ${call.name}`,
          durationMs: Date.now() - startTime,
          id: call.id,
        }
      }

      try {
        // Validate with Zod if available
        let params = call.arguments
        if (tool.zodSchema) {
          const parsed = tool.zodSchema.safeParse(params)
          if (!parsed.success) {
            return {
              name: call.name,
              result: null,
              success: false,
              error: `Validation error: ${parsed.error.message}`,
              durationMs: Date.now() - startTime,
              id: call.id,
            }
          }
          params = parsed.data as Record<string, unknown>
        }

        const result = await tool.execute(params, context)

        return {
          name: call.name,
          result,
          success: true,
          durationMs: Date.now() - startTime,
          id: call.id,
        }
      } catch (error) {
        return {
          name: call.name,
          result: null,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: Date.now() - startTime,
          id: call.id,
        }
      }
    },

    async executeMany(
      calls: ToolCallRequest[],
      context: ToolContext
    ): Promise<ToolCallResult[]> {
      // Execute in parallel for efficiency
      return Promise.all(calls.map((call) => this.execute(call, context)))
    },
  }
}


/**
 * Run a prompt with tools using Workers AI
 *
 * This is the main entry point for tool-augmented generation.
 * Uses @cloudflare/ai-utils for embedded function calling.
 */
export async function runWithTools(
  ai: WorkersAIBinding,
  prompt: string,
  tools: Tool[] | ToolRegistry,
  options: RunWithToolsOptions & {
    model?: ModelId | string
    context?: ToolContext
    systemPrompt?: string
  } = {}
): Promise<RunWithToolsResult> {
  const startTime = Date.now()
  // Resolve model alias to full ID, defaulting to recommended tool-capable model
  const modelId = options.model ? resolveModelId(options.model) : getRecommendedModel('tools')
  const toolList = Array.isArray(tools) ? tools : tools.getAll()
  const context = options.context || {}
  const toolCallResults: ToolCallResult[] = []

  // Verify model supports tools
  if (!supportsTools(modelId)) {
    throw new Error(
      `Model "${modelId}" does not support tool calling. ` +
        `Use a tool-capable model like '@cf/meta/llama-3.3-70b-instruct-fp8-fast' or an alias like 'llama-70b'.`
    )
  }

  // Build messages
  const messages: Array<{ role: string; content: string }> = []
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  // Convert tools to Cloudflare format with callbacks
  // Type assertion needed as our JSONSchema is compatible but TypeScript is strict
  const cfTools = toolList.map((tool) =>
    cfTool({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as any, // JSONSchema7 compatible
      function: async (args: Record<string, unknown>) => {
        const callStart = Date.now()

        // Notify callback
        options.onToolCall?.({ name: tool.name, arguments: args })

        try {
          const result = await tool.execute(args, context)
          const callResult: ToolCallResult = {
            name: tool.name,
            result,
            success: true,
            durationMs: Date.now() - callStart,
          }
          toolCallResults.push(callResult)
          options.onToolResult?.(callResult)

          return typeof result === 'string' ? result : JSON.stringify(result)
        } catch (error) {
          const callResult: ToolCallResult = {
            name: tool.name,
            result: null,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            durationMs: Date.now() - callStart,
          }
          toolCallResults.push(callResult)
          options.onToolResult?.(callResult)

          throw error
        }
      },
    })
  )

  // Run with tools using @cloudflare/ai-utils
  const result = await cfRunWithTools(
    ai as any,
    modelId,
    {
      messages,
      tools: cfTools as any,
    },
    {
      maxRecursiveToolRuns: options.maxIterations || 5,
      streamFinalResponse: options.stream || false,
      // trimFunction can be used to limit tools shown to model
    }
  )

  // Handle streaming vs non-streaming response
  let response: string
  if (options.stream && result instanceof ReadableStream) {
    // For streaming, return the stream wrapped in result
    // The caller should handle the stream
    response = '[STREAM]'
  } else if (typeof result === 'object' && result !== null) {
    // Non-streaming response
    response =
      (result as any).response ||
      (result as any).content ||
      JSON.stringify(result)
  } else {
    response = String(result)
  }

  return {
    response,
    toolCalls: toolCallResults,
    iterations: toolCallResults.length > 0 ? Math.ceil(toolCallResults.length / toolList.length) : 1,
    durationMs: Date.now() - startTime,
    model: modelId,
  }
}

/**
 * Run a chat conversation with tools
 */
export async function chatWithTools(
  ai: WorkersAIBinding,
  messages: ChatMessage[],
  tools: Tool[] | ToolRegistry,
  options: RunWithToolsOptions & {
    model?: ModelId | string
    context?: ToolContext
  } = {}
): Promise<RunWithToolsResult> {
  const startTime = Date.now()
  // Resolve model alias to full ID, defaulting to recommended tool-capable model
  const modelId = options.model ? resolveModelId(options.model) : getRecommendedModel('tools')
  const toolList = Array.isArray(tools) ? tools : tools.getAll()
  const context = options.context || {}
  const toolCallResults: ToolCallResult[] = []

  if (!supportsTools(modelId)) {
    throw new Error(
      `Model "${modelId}" does not support tool calling.`
    )
  }

  // Convert tools to Cloudflare format
  const cfTools = toolList.map((tool) =>
    cfTool({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as any, // JSONSchema7 compatible
      function: async (args: Record<string, unknown>) => {
        const callStart = Date.now()
        options.onToolCall?.({ name: tool.name, arguments: args })

        try {
          const result = await tool.execute(args, context)
          const callResult: ToolCallResult = {
            name: tool.name,
            result,
            success: true,
            durationMs: Date.now() - callStart,
          }
          toolCallResults.push(callResult)
          options.onToolResult?.(callResult)
          return typeof result === 'string' ? result : JSON.stringify(result)
        } catch (error) {
          const callResult: ToolCallResult = {
            name: tool.name,
            result: null,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            durationMs: Date.now() - callStart,
          }
          toolCallResults.push(callResult)
          options.onToolResult?.(callResult)
          throw error
        }
      },
    })
  )

  const result = await cfRunWithTools(
    ai as any,
    modelId,
    {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: cfTools as any,
    },
    {
      maxRecursiveToolRuns: options.maxIterations || 5,
      streamFinalResponse: options.stream || false,
    }
  )

  let response: string
  if (typeof result === 'object' && result !== null) {
    response =
      (result as any).response ||
      (result as any).content ||
      JSON.stringify(result)
  } else {
    response = String(result)
  }

  return {
    response,
    toolCalls: toolCallResults,
    iterations: toolCallResults.length > 0 ? Math.ceil(toolCallResults.length / toolList.length) : 1,
    durationMs: Date.now() - startTime,
    model: modelId,
  }
}

/**
 * Stream a prompt with tools (returns ReadableStream)
 */
export async function streamWithTools(
  ai: WorkersAIBinding,
  prompt: string,
  tools: Tool[] | ToolRegistry,
  options: Omit<RunWithToolsOptions, 'stream'> & {
    model?: ModelId | string
    context?: ToolContext
    systemPrompt?: string
  } = {}
): Promise<ReadableStream> {
  // Resolve model alias to full ID, defaulting to recommended tool-capable model
  const modelId = options.model ? resolveModelId(options.model) : getRecommendedModel('tools')
  const toolList = Array.isArray(tools) ? tools : tools.getAll()
  const context = options.context || {}

  if (!supportsTools(modelId)) {
    throw new Error(`Model "${modelId}" does not support tool calling.`)
  }

  const messages: Array<{ role: string; content: string }> = []
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const cfTools = toolList.map((tool) =>
    cfTool({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as any, // JSONSchema7 compatible
      function: async (args: Record<string, unknown>) => {
        options.onToolCall?.({ name: tool.name, arguments: args })
        const result = await tool.execute(args, context)
        return typeof result === 'string' ? result : JSON.stringify(result)
      },
    })
  )

  const stream = await cfRunWithTools(
    ai as any,
    modelId,
    {
      messages,
      tools: cfTools as any,
    },
    {
      maxRecursiveToolRuns: options.maxIterations || 5,
      streamFinalResponse: true,
    }
  )

  return stream as ReadableStream
}
