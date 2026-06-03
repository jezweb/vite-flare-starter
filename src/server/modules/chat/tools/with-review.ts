/**
 * with_review — Worker→Reviewer quality loop.
 *
 * Pattern adopted from OpenSwarm's pair-pipeline (see
 * `.jez/artifacts/skills-and-swarm-plan-2026-05-06.md`):
 *
 *   Worker drafts → Reviewer scores against criteria → verdict
 *      APPROVE: ship it
 *      REVISE:  feed notes back to Worker, draft again (capped at max_iters)
 *      REJECT:  fundamentally wrong shape — bail and surface to caller
 *
 * Generic. Use for any output where quality matters more than speed:
 * emails before send, reports, code generation, summaries that matter.
 *
 * Per-role models: cheap Haiku worker, smarter Sonnet reviewer, optional
 * escalation model after N failed iterations. The verdict format is
 * structured (`VERDICT: <KIND> — <note>` on a single line) so the
 * outcome is machine-readable; if the reviewer ignores the format, we
 * default to REVISE with the full response as the note.
 *
 * Reviewer criteria can be:
 *   - `{ skill: 'name' }`  — load a SKILL.md and use its body
 *   - `{ inline: '...' }`  — pass criteria as a one-off prompt
 *
 * The default reviewer skill is `review-output` (bundled), covering
 * accuracy / intent / tone / no hallucinations / clarity.
 */
import { z } from 'zod'
import { GitPullRequest } from 'lucide-react'
import { runModelText } from '@/server/lib/ai/providers'
import { loadSkill } from '@/server/lib/ai/skills/registry'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

interface ReviewEnv {
  AI?: unknown
  DB?: D1Database
  SKILLS?: R2Bucket
  OPENROUTER_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_AI_API_KEY?: string
  DEEPSEEK_API_KEY?: string
  MISTRAL_API_KEY?: string
  XAI_API_KEY?: string
}

const DEFAULT_WORKER = 'anthropic/claude-haiku-4.5'
const DEFAULT_REVIEWER = 'anthropic/claude-sonnet-4.6'

const VERDICT_REGEX = /^VERDICT:\s*(APPROVE|REVISE|REJECT)\s*[—\-]\s*(.+)$/m

const Verdict = z.enum(['APPROVE', 'REVISE', 'REJECT'])

const WithReviewInput = z.object({
  task: z
    .string()
    .min(20)
    .max(8000)
    .describe(
      'What the worker should produce. Plain English. Be specific about audience, format, length.'
    ),
  criteria: z
    .union([
      z
        .object({ skill: z.string() })
        .describe('Load reviewer criteria from a Skill name (e.g. "review-output").'),
      z.object({ inline: z.string().min(20) }).describe('Inline reviewer criteria as a prompt.'),
    ])
    .describe(
      'Reviewer criteria — either a Skill name or inline prompt. Skills are durable; inline is for one-offs.'
    ),
  worker_model: z
    .string()
    .optional()
    .describe(`Override the worker model. Default: ${DEFAULT_WORKER} (cheap; revises easily).`),
  reviewer_model: z
    .string()
    .optional()
    .describe(`Override the reviewer model. Default: ${DEFAULT_REVIEWER} (smarter judgement).`),
  escalate_model: z
    .string()
    .optional()
    .describe('Used as the reviewer from iteration 3 onwards. Default: same as reviewer_model.'),
  max_iters: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Max worker iterations. Default 3.'),
  context: z
    .string()
    .optional()
    .describe(
      'Extra context shared with both worker and reviewer (e.g. recipient details, source material).'
    ),
})

const WithReviewOutput = z.union([
  z.object({
    ok: z.literal(true),
    verdict: z.enum(['APPROVE', 'REJECT']),
    iterations: z.number(),
    final_text: z.string(),
    review_notes: z.array(z.string()),
    models_used: z.object({ worker: z.string(), reviewer: z.string() }),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
])

function getEnv(ctx: AgentContext): ReviewEnv | undefined {
  return ctx.env as ReviewEnv
}

async function loadCriteriaText(
  env: ReviewEnv,
  userId: string,
  criteria: z.infer<typeof WithReviewInput>['criteria']
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if ('inline' in criteria) {
    return { ok: true, text: criteria.inline }
  }
  if (!env.DB) return { ok: false, error: 'DB binding required to load skill-based criteria' }
  const skill = await loadSkill(
    env as { DB: D1Database; SKILLS?: R2Bucket },
    criteria.skill,
    userId
  )
  if (!skill) return { ok: false, error: `Skill "${criteria.skill}" not found` }
  return { ok: true, text: skill.body }
}

async function runWorker(
  env: ReviewEnv,
  modelId: string,
  task: string,
  context: string | undefined,
  previousDraft: string | undefined,
  reviewerNote: string | undefined
): Promise<string> {
  const systemPrompt = previousDraft
    ? "You are revising your previous draft based on reviewer feedback. Address the reviewer's specific notes. Return ONLY the revised draft — no preamble, no commentary about what you changed. CRITICAL: use the actual values from the Task (names, amounts, IDs, codes) verbatim — never substitute [PLACEHOLDER] tokens. Bracketed placeholders are a fail."
    : 'You are producing the requested output. Return ONLY the final draft — no preamble, no meta-commentary, no apologies. Match the format the user asked for. CRITICAL: use the actual values from the Task (names, amounts, IDs, codes) verbatim — never substitute [PLACEHOLDER] tokens. If the task says "customer Alex" and "$89.50", write "Alex" and "$89.50", not "[CUSTOMER_NAME]" and "[REFUND_AMOUNT]".'

  const userPromptParts = [`Task: ${task}`]
  if (context) userPromptParts.push(`\nContext:\n${context}`)
  if (previousDraft && reviewerNote) {
    userPromptParts.push(`\nPrevious draft:\n${previousDraft}`)
    userPromptParts.push(`\nReviewer notes (address these):\n${reviewerNote}`)
  }
  return runModelText(
    env as Parameters<typeof runModelText>[0],
    modelId,
    systemPrompt,
    userPromptParts.join('\n')
  )
}

async function runReviewer(
  env: ReviewEnv,
  modelId: string,
  task: string,
  draft: string,
  criteriaText: string,
  context: string | undefined
): Promise<{ verdict: z.infer<typeof Verdict>; note: string }> {
  const systemPrompt =
    "You are a strict reviewer. Score the worker's draft against the criteria, judging it relative to the original Task (which included specific details the worker was meant to use — anything in the Task is grounded, not invented). Respond with EXACTLY ONE LINE in this format and nothing else:\n" +
    '\n' +
    '  VERDICT: APPROVE — <one-sentence reason>\n' +
    '  VERDICT: REVISE — <specific actionable change needed>\n' +
    "  VERDICT: REJECT — <why this can't be fixed by revision>\n" +
    '\n' +
    'APPROVE only if the draft cleanly meets the criteria AND uses the specific values provided in the Task (no `[PLACEHOLDER]` substitutes). REVISE for fixable issues — placeholder leakage like `[ORDER_NUMBER]` when the task gave a real order number is always REVISE. REJECT only when the draft is fundamentally wrong (e.g. answered a different question).'

  const userPromptParts = [`Task (the original request):\n${task}`]
  userPromptParts.push(`\nCriteria:\n${criteriaText}`)
  if (context) userPromptParts.push(`\nContext:\n${context}`)
  userPromptParts.push(`\nWorker's draft:\n${draft}`)

  const text = await runModelText(
    env as Parameters<typeof runModelText>[0],
    modelId,
    systemPrompt,
    userPromptParts.join('\n')
  )
  const match = text.match(VERDICT_REGEX)
  if (!match) {
    // Reviewer didn't follow the format. Treat as REVISE with full text
    // as the note — gives the worker a chance to address whatever the
    // reviewer was actually saying.
    return { verdict: 'REVISE', note: text || 'Reviewer response was empty.' }
  }
  return {
    verdict: match[1] as z.infer<typeof Verdict>,
    note: (match[2] ?? '').trim(),
  }
}

export const withReviewDefinition: ToolDefinition<
  z.infer<typeof WithReviewInput>,
  z.infer<typeof WithReviewOutput>
> = {
  name: 'with_review',
  description:
    'Run an AI task through a worker→reviewer quality loop. Worker drafts, reviewer scores against criteria (APPROVE / REVISE / REJECT), worker rewrites on REVISE — capped at max_iters. Use for high-quality outputs that matter: emails before send, reports, code generation, summaries with reviewer-grade quality. Triggers: phrases like "review before sending", "draft and review", "quality check", "polish this until it\'s right".',
  inputSchema: WithReviewInput,
  outputSchema: WithReviewOutput,
  isAvailable: (ctx) => {
    const env = getEnv(ctx)
    if (!env) return false
    // Need at least one provider key reachable by resolveModel.
    return !!(
      env.OPENROUTER_API_KEY ||
      env.ANTHROPIC_API_KEY ||
      env.OPENAI_API_KEY ||
      env.GOOGLE_AI_API_KEY ||
      env.DEEPSEEK_API_KEY ||
      env.MISTRAL_API_KEY ||
      env.XAI_API_KEY
    )
  },
  needsApproval: false,
  execute: async (input, ctx) => {
    const env = getEnv(ctx)
    if (!env) return { ok: false as const, error: 'No env in context' }

    const workerModel = input.worker_model ?? DEFAULT_WORKER
    const reviewerModel = input.reviewer_model ?? DEFAULT_REVIEWER
    const escalateModel = input.escalate_model ?? reviewerModel
    const maxIters = input.max_iters ?? 3

    // Load reviewer criteria once (skill or inline).
    const criteriaResult = await loadCriteriaText(env, ctx.userId, input.criteria)
    if (!criteriaResult.ok) {
      return { ok: false as const, error: criteriaResult.error }
    }
    const criteriaText = criteriaResult.text

    const notes: string[] = []
    let draft: string
    try {
      draft = await runWorker(env, workerModel, input.task, input.context, undefined, undefined)
    } catch (err) {
      return {
        ok: false as const,
        error: `Worker failed on first draft: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    for (let i = 1; i <= maxIters; i++) {
      // Escalate to a smarter reviewer from iteration 3 onwards.
      const usingModel = i >= 3 ? escalateModel : reviewerModel
      let review: { verdict: z.infer<typeof Verdict>; note: string }
      try {
        review = await runReviewer(env, usingModel, input.task, draft, criteriaText, input.context)
      } catch (err) {
        return {
          ok: false as const,
          error: `Reviewer failed on iteration ${i}: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
      notes.push(`[iter ${i}] ${review.verdict}: ${review.note}`)

      if (review.verdict === 'APPROVE') {
        return {
          ok: true as const,
          verdict: 'APPROVE',
          iterations: i,
          final_text: draft,
          review_notes: notes,
          models_used: { worker: workerModel, reviewer: usingModel },
        }
      }
      if (review.verdict === 'REJECT') {
        return {
          ok: true as const,
          verdict: 'REJECT',
          iterations: i,
          final_text: draft,
          review_notes: notes,
          models_used: { worker: workerModel, reviewer: usingModel },
        }
      }
      // REVISE — try again unless we're out of iterations.
      if (i === maxIters) break
      try {
        draft = await runWorker(env, workerModel, input.task, input.context, draft, review.note)
      } catch (err) {
        return {
          ok: false as const,
          error: `Worker failed on iteration ${i + 1}: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }

    // Hit max_iters without APPROVE/REJECT — surface the latest draft + notes
    // and let the caller decide what to do. We return verdict=REJECT to
    // signal the loop didn't converge, but `final_text` still has the
    // most recent draft if the caller wants to ship it manually.
    return {
      ok: true as const,
      verdict: 'REJECT',
      iterations: maxIters,
      final_text: draft,
      review_notes: notes,
      models_used: { worker: workerModel, reviewer: reviewerModel },
    }
  },
  render: {
    icon: GitPullRequest,
    displayName: 'Worker + Reviewer',
    summary: (output) => {
      if (!output.ok) return `Error: ${output.error.slice(0, 80)}`
      return `${output.verdict} after ${output.iterations} iter${output.iterations === 1 ? '' : 's'}`
    },
  },
}

export const withReviewDefinitions = [withReviewDefinition] as ToolDefinition<unknown, unknown>[]
