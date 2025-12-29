/**
 * Workers AI Module - Utility Functions
 *
 * Helper functions for processing AI responses, extracting structured data,
 * and handling model-specific output formats.
 */

import type { ChatMessage } from './types'

/**
 * Result of extracting thinking tokens from a response
 */
export interface ThinkingResult {
  /** The model's reasoning/thinking process (if present) */
  thinking: string | null
  /** The final response content with thinking tokens removed */
  content: string
}

/**
 * Extract thinking tokens from reasoning model responses.
 *
 * Reasoning models like Qwen QwQ output their chain-of-thought
 * inside <think>...</think> tags. This function extracts them separately.
 *
 * Handles multiple formats:
 * - Full tags: <think>...</think>
 * - Full tags with content before/after: "Here's my response: <think>...</think> Answer"
 * - Missing opening tag at start: thinking...</think> (some models do this)
 * - Multiple thinking blocks: extracts all and combines
 *
 * @example
 * const { thinking, content } = extractThinking(response)
 * if (thinking) {
 *   console.log('Model reasoning:', thinking)
 * }
 * console.log('Final answer:', content)
 */
export function extractThinking(text: string): ThinkingResult {
  // Match all <think>...</think> blocks (case-insensitive, handles newlines)
  const thinkingBlocks: string[] = []
  let content = text

  // Find all complete <think>...</think> blocks
  const fullMatches = text.matchAll(/<think>([\s\S]*?)<\/think>/gi)
  for (const match of fullMatches) {
    if (match[1]) {
      thinkingBlocks.push(match[1].trim())
    }
  }

  // Remove all <think>...</think> blocks from content
  content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  // If we found thinking blocks, return them
  if (thinkingBlocks.length > 0) {
    return {
      thinking: thinkingBlocks.join('\n\n'),
      content,
    }
  }

  // Handle case where opening <think> tag is missing but </think> is present
  // This handles models that output thinking without the opening tag at the start
  // Only apply this if the </think> tag appears relatively early (within first 80% of text)
  const closeTagIndex = text.toLowerCase().indexOf('</think>')
  if (closeTagIndex !== -1 && closeTagIndex < text.length * 0.8) {
    const thinking = text.substring(0, closeTagIndex).trim()
    const remaining = text.substring(closeTagIndex + '</think>'.length).trim()

    // Only treat as thinking if there's meaningful content after
    if (remaining.length > 0 && thinking.length > 0) {
      return { thinking, content: remaining }
    }
  }

  return { thinking: null, content: text }
}

/**
 * Extract JSON from a text response.
 *
 * LLMs often return JSON embedded in explanatory text or markdown code blocks.
 * This function finds and parses the first valid JSON object in the response.
 *
 * @example
 * const data = extractJSON<{ summary: string }>(response)
 * if (data) {
 *   console.log(data.summary)
 * }
 */
export function extractJSON<T = Record<string, unknown>>(text: string): T | null {
  // First, try to clean markdown code blocks
  const cleaned = cleanResponse(text)

  // Try to find a JSON object
  const objectMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]) as T
    } catch {
      // JSON parsing failed, try to find the outermost braces
    }
  }

  // Try to find a JSON array
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as T
    } catch {
      // JSON parsing failed
    }
  }

  return null
}

/**
 * Extract a JSON array from a text response.
 *
 * @example
 * const items = extractJSONArray<{ id: string; name: string }>(response)
 */
export function extractJSONArray<T = unknown>(text: string): T[] | null {
  const cleaned = cleanResponse(text)
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)

  if (arrayMatch) {
    try {
      const result = JSON.parse(arrayMatch[0])
      if (Array.isArray(result)) {
        return result as T[]
      }
    } catch {
      // JSON parsing failed
    }
  }

  return null
}

/**
 * Clean and normalize text output from an LLM.
 *
 * Removes common artifacts like markdown code fences, extra whitespace,
 * and model-specific formatting.
 */
export function cleanResponse(text: string): string {
  return (
    text
      // Remove markdown code fences (```json, ```typescript, etc.)
      .replace(/^```(?:json|typescript|javascript|text|ts|js)?\s*\n?/gm, '')
      .replace(/```\s*$/gm, '')
      // Remove leading/trailing whitespace
      .trim()
  )
}

/**
 * Truncate text to approximate token count.
 *
 * Uses the rough approximation of 4 characters per token.
 * Adds ellipsis if truncated.
 *
 * @param text - The text to truncate
 * @param maxTokens - Maximum number of tokens
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4

  if (text.length <= maxChars) {
    return text
  }

  return text.slice(0, maxChars - 3) + '...'
}

/**
 * Estimate token count for a string.
 *
 * This is a rough approximation (4 chars = 1 token) for planning purposes.
 * Not accurate for billing - use actual token counts from API responses.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Format chat messages into a prompt string.
 *
 * Useful for models that don't have native chat support
 * or for debugging/logging.
 *
 * @example
 * const prompt = formatChatPrompt([
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'Hello!' },
 * ])
 */
export function formatChatPrompt(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const roleLabel = m.role.toUpperCase()
      return `${roleLabel}: ${m.content}`
    })
    .join('\n\n')
}

/**
 * Build a JSON generation prompt.
 *
 * Appends instructions to output valid JSON only.
 *
 * @param prompt - The base prompt
 * @param schemaDescription - Optional description of expected fields
 */
export function buildJSONPrompt(prompt: string, schemaDescription?: string): string {
  let jsonPrompt = prompt

  if (schemaDescription) {
    jsonPrompt += `\n\nExpected JSON structure:\n${schemaDescription}`
  }

  jsonPrompt += '\n\nRespond with valid JSON only. No explanation or markdown code fences, just the JSON object.'

  return jsonPrompt
}

/**
 * Safe JSON stringify that handles circular references
 */
export function safeStringify(obj: unknown, indent?: number): string {
  const seen = new WeakSet()

  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]'
        }
        seen.add(value)
      }
      return value
    },
    indent
  )
}

/**
 * Token usage estimation result
 */
export interface TokenUsage {
  /** Estimated input tokens */
  inputTokens: number
  /** Estimated output tokens */
  outputTokens: number
  /** Total tokens */
  totalTokens: number
}

/**
 * Estimate token usage for a request/response pair.
 *
 * Uses the rough approximation of 4 characters per token.
 * This is an estimate - actual token counts may vary by model.
 *
 * @param inputText - The input prompt or messages
 * @param outputText - The generated response
 * @returns Estimated token counts
 */
export function estimateTokenUsage(inputText: string, outputText: string): TokenUsage {
  const inputTokens = Math.ceil(inputText.length / 4)
  const outputTokens = Math.ceil(outputText.length / 4)

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  }
}

/**
 * Estimate tokens for chat messages
 *
 * @param messages - Array of chat messages
 * @returns Estimated input token count
 */
export function estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  // Account for message formatting overhead (~4 tokens per message for role tags)
  const overhead = messages.length * 4
  const contentTokens = messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0)
  return overhead + contentTokens
}
