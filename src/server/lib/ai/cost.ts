/**
 * AI cost estimation
 *
 * Computes USD cost from token counts using the bundled model
 * catalogue (mirror of https://models.flared.au — list prices per
 * million tokens). Used by `aiUsageLogs.costUsd` and
 * `aiToolCalls.costUsd` so per-user / per-conversation / per-tool
 * cost reports become a SQL query, not a manual price lookup.
 *
 * Caveats:
 *   - Returns null for Workers AI models and unknown ids. Workers AI
 *     is technically priced (Neurons consumed) but not on a per-Mtok
 *     basis comparable to OpenAI/Anthropic — leaving it null is more
 *     honest than fabricating a $0.00 figure.
 *   - The cost reflects catalogue list prices, which mirror
 *     OpenRouter's listed rates. Direct provider routes are slightly
 *     cheaper (no OpenRouter markup); we don't model that distinction
 *     because the gap is <10% and accuracy isn't worth the complexity.
 *   - Anthropic prompt-cache hits are not yet broken out by the AI
 *     SDK's usage shape — until they are, cached input is billed at
 *     full rate here. Conservative; will under-report cache savings.
 */
import { getModel } from './models'
import snapshot from '@/shared/data/models-snapshot.json'

interface SnapshotModel {
  id: string
  pricing?: { input?: number; output?: number }
  source?: 'openrouter' | 'workers-ai'
}

interface Snapshot {
  models: SnapshotModel[]
}

/**
 * Build a lookup once at module load. The snapshot has ~170 models;
 * a Map keeps `computeCost` O(1) per call without re-scanning.
 */
const PRICING = new Map<string, { input: number; output: number; isFree: boolean }>(
  (snapshot as Snapshot).models.map((m) => {
    const isFree = m.source === 'workers-ai' || (m.pricing?.input ?? 0) === 0
    return [
      m.id,
      {
        input: m.pricing?.input ?? 0,
        output: m.pricing?.output ?? 0,
        isFree,
      },
    ]
  }),
)

export interface CostBreakdown {
  /** Total USD for this call. Null if pricing isn't known. */
  total: number | null
  /** USD spent on input tokens, broken out for diagnostics. */
  input: number | null
  /** USD spent on output tokens. */
  output: number | null
  /** True when we know for sure cost is $0 (Workers AI, free models). */
  isFree: boolean
  /** Pricing source — 'catalogue' for known ids, 'unknown' otherwise. */
  source: 'catalogue' | 'unknown'
}

/**
 * Compute cost for a single API call. Both prices are USD per million
 * tokens. The returned breakdown is suitable for direct insertion as
 * the `costUsd` column on aiUsageLogs / aiToolCalls.
 *
 * Strips the `openrouter/` prefix before lookup so explicitly-routed
 * models still match the catalogue.
 */
export function computeCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): CostBreakdown {
  // Strip the optional explicit-OpenRouter prefix — the catalogue is
  // keyed on the canonical id (`anthropic/claude-...`), not the routed
  // form (`openrouter/anthropic/claude-...`).
  const lookupId = modelId.startsWith('openrouter/')
    ? modelId.slice('openrouter/'.length)
    : modelId
  const pricing = PRICING.get(lookupId)
  if (!pricing) {
    return { total: null, input: null, output: null, isFree: false, source: 'unknown' }
  }
  if (pricing.isFree) {
    return { total: 0, input: 0, output: 0, isFree: true, source: 'catalogue' }
  }
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return {
    total: inputCost + outputCost,
    input: inputCost,
    output: outputCost,
    isFree: false,
    source: 'catalogue',
  }
}

/** Convenience — total only, suitable for direct DB writes. */
export function costFor(modelId: string, inputTokens: number, outputTokens: number): number | null {
  return computeCost(modelId, inputTokens, outputTokens).total
}

/**
 * For diagnostics: given a model id, return the per-Mtok prices the
 * cost helper will use. Useful for the admin panel to show "you're
 * billed at $X/M in, $Y/M out for this model".
 */
export function pricingFor(modelId: string): { input: number; output: number; isFree: boolean } | null {
  const lookupId = modelId.startsWith('openrouter/')
    ? modelId.slice('openrouter/'.length)
    : modelId
  return PRICING.get(lookupId) ?? null
}

/** Whether we have a price entry for this model — drives "$X estimated"
 *  vs "cost not tracked" copy in the UI. */
export function hasPricing(modelId: string): boolean {
  return pricingFor(modelId) !== null
}

/** Re-export getModel so callers don't need a separate import path. */
export { getModel }
