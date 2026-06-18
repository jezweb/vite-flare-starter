/**
 * Model roles (#87) — name the *job*, not the model.
 *
 * Two kinds of AI call recur across the app and want different models:
 *
 *   - composer — templated composition + bounded structured output
 *     (titles, summaries, extraction, schedule parsing). Wants a fast model
 *     with thinking OFF: a reasoning model burns its (often capped) output
 *     budget thinking *before* the answer and can return empty content under
 *     a tight max_tokens — the failure the dep-review investigation hit on
 *     a 40-token title call. Verified pattern in llm-patterns.md.
 *
 *   - reasoner — open-ended work (a scheduled task following a skill, an
 *     agent deciding what to do). Wants a capable/thinking model.
 *
 * Hardcoding one model at each call site forces a bad tradeoff and scatters
 * the "remember to disable thinking" decision. A role resolves to BOTH a
 * model id AND whether thinking should be off, so that decision travels with
 * the model choice. Forks retune with one env var per role — no code edit.
 *
 *   const role = resolveModelRole(env, 'composer')
 *   const { text } = await generateText({
 *     model: resolveModel(env, role.modelId),
 *     prompt,
 *     providerOptions: thinkingOffProviderOptions(role),
 *   })
 */
import type { ModelId } from './types'
import { DEFAULT_MODEL, isReasoningModel } from './models'

export type ModelRole = 'composer' | 'reasoner'

interface RoleConfig {
  /** Env var that overrides the model for this role (e.g. MODEL_ROLE_COMPOSER). */
  envVar: string
  /** Model used when the env var is unset. */
  default: ModelId
  /** Whether thinking should be disabled for this role's calls. */
  thinkingOff: boolean
}

/**
 * Defaults both point at DEFAULT_MODEL (Kimi K2.6) — free on Workers AI and
 * strong at both jobs. The difference is thinking: composer turns it off (fast
 * + no empty-content risk on bounded tasks), reasoner leaves it on. Override
 * either with MODEL_ROLE_COMPOSER / MODEL_ROLE_REASONER; the thinkingOff flag
 * becomes a harmless no-op for non-reasoning models. NOTE: some composer call
 * sites use AI SDK structured output (generateObject / Output.object), which
 * the gpt-oss family fails through workers-ai-provider — pick a structured-
 * output-capable model if you override composer (verified 2026-06-10).
 */
export const MODEL_ROLES: Record<ModelRole, RoleConfig> = {
  composer: { envVar: 'MODEL_ROLE_COMPOSER', default: DEFAULT_MODEL, thinkingOff: true },
  reasoner: { envVar: 'MODEL_ROLE_REASONER', default: DEFAULT_MODEL, thinkingOff: false },
}

export interface ResolvedRole {
  modelId: ModelId
  /**
   * True only when the role disables thinking AND the resolved model is a
   * Workers AI reasoning model (the only case where the passthrough kwarg
   * does anything). Lets call sites blindly spread the helpers below.
   */
  thinkingOff: boolean
}

/** Workers AI provider passthrough that disables a reasoning model's thinking. */
export const WORKERS_AI_THINKING_OFF = {
  'workers-ai': { chat_template_kwargs: { thinking: false } },
} as const

function isWorkersAiReasoning(modelId: string): boolean {
  const isWai = modelId.startsWith('@cf/') || modelId.startsWith('@hf/')
  return isWai && isReasoningModel(modelId)
}

/** Resolve a role to a concrete model id + whether to disable thinking. */
export function resolveModelRole(env: Record<string, unknown>, role: ModelRole): ResolvedRole {
  const cfg = MODEL_ROLES[role]
  const raw = env[cfg.envVar]
  const override = typeof raw === 'string' ? raw.trim() : ''
  const modelId = override || cfg.default
  return { modelId, thinkingOff: cfg.thinkingOff && isWorkersAiReasoning(modelId) }
}

/** AI SDK `providerOptions` for a resolved role (undefined when not needed). */
export function thinkingOffProviderOptions(role: ResolvedRole) {
  return role.thinkingOff ? WORKERS_AI_THINKING_OFF : undefined
}

/**
 * Options fragment for the raw `env.AI.run(modelId, …)` binding (no AI SDK).
 * Spread into the run options: `{ ...thinkingOffRunOptions(role) }`.
 */
export function thinkingOffRunOptions(role: ResolvedRole) {
  return role.thinkingOff ? { chat_template_kwargs: { thinking: false } } : {}
}
