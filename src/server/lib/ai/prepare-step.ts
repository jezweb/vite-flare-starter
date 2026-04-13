/**
 * Agent prepareStep functions
 *
 * Called before each step in the ToolLoopAgent loop.
 * Used for token budget tracking and dynamic tool management.
 */
import type { ToolSet } from 'ai'

interface TokenBudgetOptions {
  maxTotalTokens: number
}

/**
 * Track cumulative token usage across steps and stop the agent
 * when approaching the budget limit by removing all tools.
 */
export function tokenBudgetPrepareStep<TOOLS extends ToolSet>({ maxTotalTokens }: TokenBudgetOptions) {
  return ({ steps }: { steps: Array<{ usage?: { inputTokens?: number; outputTokens?: number } }> }) => {
    const totalTokens = steps.reduce((acc, step) => {
      return acc + (step.usage?.inputTokens ?? 0) + (step.usage?.outputTokens ?? 0)
    }, 0)

    if (totalTokens > maxTotalTokens) {
      // Over budget: force text-only response (no tool calls)
      return { activeTools: [] as Array<keyof TOOLS & string> }
    }

    return {}
  }
}
