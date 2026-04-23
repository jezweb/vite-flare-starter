/**
 * Core Tools — always available, zero dependencies
 *
 * Simple primitives that work in any environment: time, math, registry lookup.
 * All on the canonical ToolDefinition contract (Phase 0).
 */
import { z } from 'zod'
import { Clock, Info, Calculator, CheckCheck } from 'lucide-react'
import { getModel, listModels } from '@/server/lib/ai/models'
import type { ModelId } from '@/server/lib/ai/types'
import type { ToolDefinition } from '@/shared/agent'

/**
 * Safe arithmetic evaluator using Shunting-Yard.
 * Workers disallow dynamic code execution. This supports + - * / % and parentheses.
 */
function computeArithmetic(expr: string): number {
  const tokens: string[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]!
    if (/\s/.test(ch)) { i++; continue }
    if (/[\d.]/.test(ch)) {
      let num = ''
      while (i < expr.length && /[\d.]/.test(expr[i]!)) { num += expr[i]; i++ }
      tokens.push(num)
      continue
    }
    if ('+-*/%()'.includes(ch)) { tokens.push(ch); i++; continue }
    throw new Error(`unexpected '${ch}'`)
  }
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 }
  const output: string[] = []
  const ops: string[] = []
  let prev = ''
  for (const t of tokens) {
    if (/^[\d.]+$/.test(t)) {
      output.push(t)
    } else if (t === '(') {
      ops.push(t)
    } else if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop()!)
      if (!ops.length) throw new Error('mismatched )')
      ops.pop()
    } else {
      const isUnary = (t === '-' || t === '+') && (prev === '' || prev === '(' || '+-*/%'.includes(prev))
      const op = isUnary ? (t === '-' ? 'u-' : 'u+') : t
      const p = isUnary ? 3 : (prec[t] ?? 0)
      while (ops.length && ops[ops.length - 1] !== '(' && (prec[ops[ops.length - 1]!] ?? 3) >= p) {
        output.push(ops.pop()!)
      }
      ops.push(op)
    }
    prev = t
  }
  while (ops.length) {
    const op = ops.pop()!
    if (op === '(' || op === ')') throw new Error('mismatched parens')
    output.push(op)
  }
  const stack: number[] = []
  for (const t of output) {
    if (/^[\d.]+$/.test(t)) {
      stack.push(parseFloat(t))
    } else if (t === 'u-') {
      stack.push(-stack.pop()!)
    } else if (t === 'u+') {
      // no-op
    } else {
      const b = stack.pop()!
      const a = stack.pop()!
      switch (t) {
        case '+': stack.push(a + b); break
        case '-': stack.push(a - b); break
        case '*': stack.push(a * b); break
        case '/': stack.push(a / b); break
        case '%': stack.push(a % b); break
        default: throw new Error(`unknown op ${t}`)
      }
    }
  }
  if (stack.length !== 1) throw new Error('invalid expression')
  return stack[0]!
}

// ─── get_server_time ─────────────────────────────────────────────

export const getServerTimeDefinition: ToolDefinition<
  Record<string, never>,
  { utc: string; timestamp: number; timezone: string }
> = {
  name: 'get_server_time',
  description:
    'Get the current server time in UTC. Use when the user asks about the current time or date.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    utc: z.string(),
    timestamp: z.number(),
    timezone: z.string(),
  }),
  execute: async () => ({
    utc: new Date().toISOString(),
    timestamp: Date.now(),
    timezone: 'UTC',
  }),
  render: { icon: Clock, displayName: 'Server Time' },
}

// ─── get_model_info ──────────────────────────────────────────────

const GetModelInfoOutput = z.union([
  z.object({
    id: z.string(),
    name: z.string(),
    provider: z.string(),
    contextWindow: z.number(),
    supportsTools: z.boolean(),
    supportsVision: z.boolean(),
    isReasoning: z.boolean(),
    tier: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    error: z.string(),
    availableModels: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
])

export const getModelInfoDefinition: ToolDefinition<
  { modelId: string },
  z.infer<typeof GetModelInfoOutput>
> = {
  name: 'get_model_info',
  description:
    'Get capabilities and metadata for a Workers AI model. Use when the user asks about available AI models or model features.',
  inputSchema: z.object({
    modelId: z.string().describe('The model ID to look up, e.g. @cf/moonshotai/kimi-k2.6'),
  }),
  outputSchema: GetModelInfoOutput,
  execute: async ({ modelId }) => {
    const model = getModel(modelId as ModelId)
    if (!model) {
      const available = listModels().map((m) => ({ id: m.id, name: m.displayName }))
      return { error: `Unknown model: ${modelId}`, availableModels: available }
    }
    return {
      id: model.id,
      name: model.displayName,
      provider: model.provider,
      contextWindow: model.contextWindow,
      supportsTools: model.supportsTools,
      supportsVision: model.supportsVision,
      isReasoning: model.isReasoning,
      tier: model.tier,
      description: model.description,
    }
  },
  render: { icon: Info, displayName: 'Model Info' },
}

// ─── calculate ───────────────────────────────────────────────────

export const calculateDefinition: ToolDefinition<
  { expression: string },
  { expression: string; result: number } | { error: string }
> = {
  name: 'calculate',
  description: 'Evaluate a simple arithmetic expression. Use for any math calculations.',
  inputSchema: z.object({
    expression: z.string().describe('Math expression like "2 + 2" or "100 / 4 * 3"'),
  }),
  outputSchema: z.union([
    z.object({ expression: z.string(), result: z.number() }),
    z.object({ error: z.string() }),
  ]),
  execute: async ({ expression }) => {
    if (!/^[\d\s+\-*/()%.]+$/.test(expression)) {
      return { error: 'Expression contains invalid characters. Only numbers and basic operators (+, -, *, /, %) are allowed.' }
    }
    try {
      const result = computeArithmetic(expression)
      if (typeof result !== 'number' || !isFinite(result)) {
        return { error: 'Expression did not evaluate to a valid number' }
      }
      return { expression, result }
    } catch (err) {
      return { error: `Could not compute: ${expression} (${err instanceof Error ? err.message : 'parse error'})` }
    }
  },
  render: {
    icon: Calculator,
    displayName: 'Calculator',
    summary: (output) => ('error' in output ? 'failed' : String(output.result)),
  },
}

// ─── done ────────────────────────────────────────────────────────

/**
 * Done tool — signals structured task completion. Used with
 * `hasToolCall('done')` as a stop condition. MessageRenderer intercepts
 * `done` and renders its `answer` input as the final response text, so
 * the render metadata here is vestigial (never fires).
 */
export const doneDefinition: ToolDefinition<
  { answer: string },
  { answer: string; completed: boolean }
> = {
  name: 'done',
  description:
    "Signal that you have completed the current task. Use when you have a final answer and no more tool calls are needed. Put your complete answer in the answer field.",
  inputSchema: z.object({
    answer: z.string().describe("Your final, complete answer to the user's request"),
  }),
  outputSchema: z.object({ answer: z.string(), completed: z.boolean() }),
  execute: async ({ answer }) => ({ answer, completed: true }),
  render: { icon: CheckCheck, displayName: 'Done' },
}

export const coreDefinitions = [
  getServerTimeDefinition,
  getModelInfoDefinition,
  calculateDefinition,
  doneDefinition,
] as ToolDefinition<unknown, unknown>[]
