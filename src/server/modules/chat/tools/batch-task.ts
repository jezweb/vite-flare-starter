/**
 * start_batch_task — kick off a durable fan-out job over many items.
 *
 * Use case: user attaches N files (or pastes N URLs / N text snippets) and
 * asks the agent to perform the same operation on each. The agent calls
 * this tool with a single instruction + a list of items; the server
 * creates a `batch_jobs` row, schedules a Cloudflare Workflow, and returns
 * immediately with a job id. Progress is visible at `/dashboard/jobs/:id`.
 *
 * Items can be:
 *   - { ref_kind: 'r2_file', ref_value: <R2 key | filename | UUID> }
 *     The server resolves filenames and UUIDs against the user's `files`
 *     table so the agent can pass any of the three.
 *   - { ref_kind: 'url', ref_value: 'https://...' }
 *   - { ref_kind: 'text', ref_value: 'inline text body' }
 *
 * Approval gating (cost-aware):
 *   - ≤5 items: runs silently
 *   - 6-50 items: needsApproval=true (cost preview shown to user)
 *   - >50 items: also approval, with a stronger warning in the card
 */
import { z } from 'zod'
import { Layers } from 'lucide-react'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq, inArray, or } from 'drizzle-orm'
import { files as filesTable } from '@/server/modules/files/db/schema'
import { createJob } from '@/server/modules/batch-tasks/storage'
import { batchJobs } from '@/server/modules/batch-tasks/db/schema'
import type { ToolDefinition, AgentContext } from '@/shared/agent'
import type { BatchWorkflowParams } from '@/server/modules/batch-tasks/workflows/process-batch'

interface BatchTaskEnv {
  DB: D1Database
  BATCH_WORKFLOW?: {
    create(opts: { id?: string; params?: BatchWorkflowParams }): Promise<{ id: string }>
  }
}

const StartBatchTaskInput = z.object({
  instruction: z
    .string()
    .min(10)
    .max(2000)
    .describe(
      'What to do for every item. Plain English. Example: "Extract the invoice number, total, and due date as JSON."',
    ),
  task_kind: z
    .enum(['extract', 'transform', 'classify', 'summarise', 'free'])
    .default('free')
    .describe(
      'Loose category — extract: pull structured data; transform: rewrite; classify: tag/route; summarise: condense; free: anything else.',
    ),
  items: z
    .array(
      z.object({
        ref_kind: z.enum(['r2_file', 'url', 'text']),
        ref_value: z
          .string()
          .min(1)
          .describe(
            'For r2_file: filename or UUID from the user\'s files. For url: full URL. For text: inline body.',
          ),
        label: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(500)
    .describe('Items to process. 1-500 at a time. Use the user\'s attached files when relevant.'),
  model: z
    .string()
    .optional()
    .describe(
      'Override the per-item model (default: anthropic/claude-sonnet-4.6). Use cheaper models for high-volume simple tasks.',
    ),
})

const StartBatchTaskOutput = z.union([
  z.object({
    ok: z.literal(true),
    jobId: z.string(),
    jobUrl: z.string(),
    totalItems: z.number(),
    model: z.string(),
    instruction: z.string(),
    /** True when the Workflow was created; false when the binding is missing (job sits queued). */
    workflowStarted: z.boolean(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
])

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6'

function getEnv(ctx: AgentContext): BatchTaskEnv | undefined {
  const env = ctx.env as Partial<BatchTaskEnv>
  return env.DB ? (env as BatchTaskEnv) : undefined
}

const isAvailable = (ctx: AgentContext) => !!getEnv(ctx)

/**
 * Resolve an `r2_file` ref_value to its actual R2 key. The agent may pass
 * the filename, the file row's UUID, or already the bare R2 key — one
 * OR-query covers all three.
 */
async function resolveR2Keys(
  db: D1Database,
  userId: string,
  refs: string[],
): Promise<Map<string, { key: string; label?: string }>> {
  const out = new Map<string, { key: string; label?: string }>()
  if (refs.length === 0) return out

  const rows = await drizzle(db)
    .select({ id: filesTable.id, name: filesTable.name, key: filesTable.key })
    .from(filesTable)
    .where(
      and(
        eq(filesTable.userId, userId),
        or(
          inArray(filesTable.id, refs),
          inArray(filesTable.name, refs),
          inArray(filesTable.key, refs),
        ),
      ),
    )
    .catch(() => [] as { id: string; name: string; key: string }[])

  // Build three lookup tables off the single result set.
  const byId = new Map(rows.map((r) => [r.id, r]))
  const byName = new Map(rows.map((r) => [r.name, r]))
  const byKey = new Map(rows.map((r) => [r.key, r]))

  for (const ref of refs) {
    const row = byId.get(ref) ?? byName.get(ref) ?? byKey.get(ref)
    // Last resort: assume the agent already passed a bare R2 key. The
    // Workflow will surface "R2 object not found" if that's wrong.
    out.set(ref, row ? { key: row.key, label: row.name } : { key: ref })
  }
  return out
}

export const startBatchTaskDefinition: ToolDefinition<
  z.infer<typeof StartBatchTaskInput>,
  z.infer<typeof StartBatchTaskOutput>
> = {
  name: 'start_batch_task',
  description:
    "Run an AI task across many items in parallel — a durable batch / fan-out / swarm job. Use when the user wants the SAME operation applied to a list of files, URLs, or text snippets — e.g. \"for each of these 50 PDFs, extract the invoice number\", \"summarise each of these articles\", \"classify these 100 support tickets\". Returns a job id immediately; the user watches progress at /dashboard/jobs/:id.\n\nTriggers: phrases like \"for each\", \"do this for all of\", \"batch process\", \"swarm\", \"parallel\", \"in bulk\". Don't use for one-off operations on a single item.\n\nDefaults to Sonnet 4.6 per item. For 6+ items the user is asked to approve before the job starts.",
  inputSchema: StartBatchTaskInput,
  outputSchema: StartBatchTaskOutput,
  isAvailable,
  needsApproval: (input) => input.items.length > 5,
  execute: async (input, ctx) => {
    const env = getEnv(ctx)
    if (!env) return { ok: false as const, error: 'DB binding not available' }

    const model = input.model ?? DEFAULT_MODEL

    // Resolve r2_file refs to keys + labels.
    const r2Refs = input.items.filter((it) => it.ref_kind === 'r2_file').map((it) => it.ref_value)
    const resolved = await resolveR2Keys(env.DB, ctx.userId, r2Refs)

    const items = input.items.map((it) => {
      if (it.ref_kind !== 'r2_file') {
        return { ref_kind: it.ref_kind, ref_value: it.ref_value, label: it.label }
      }
      const r = resolved.get(it.ref_value)
      if (!r) {
        return { ref_kind: it.ref_kind as 'r2_file', ref_value: it.ref_value, label: it.label }
      }
      return { ref_kind: 'r2_file' as const, ref_value: r.key, label: it.label ?? r.label }
    })

    const job = await createJob(env.DB, {
      userId: ctx.userId,
      conversationId: ctx.conversationId ?? null,
      instruction: input.instruction,
      taskKind: input.task_kind,
      model,
      items,
    })

    // Kick off the Workflow. If the binding is missing the job stays
    // queued — surfaced in the response so the agent can tell the user.
    let workflowStarted = false
    if (env.BATCH_WORKFLOW) {
      try {
        const inst = await env.BATCH_WORKFLOW.create({ id: job.id, params: { jobId: job.id } })
        workflowStarted = !!inst?.id
        // Best-effort link the workflow_id back. Failure here is non-fatal
        // because the job is identified by its own row id.
        await drizzle(env.DB)
          .update(batchJobs)
          .set({ workflowId: inst.id, status: 'running', updatedAt: new Date() })
          .where(eq(batchJobs.id, job.id))
      } catch (err) {
        return {
          ok: false as const,
          error: `Failed to start Workflow: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }

    return {
      ok: true as const,
      jobId: job.id,
      jobUrl: `/dashboard/jobs/${job.id}`,
      totalItems: items.length,
      model,
      instruction: input.instruction,
      workflowStarted,
    }
  },
  render: {
    icon: Layers,
    displayName: 'Start batch task',
    summary: (output) => {
      if (!output.ok) return `Error: ${output.error.slice(0, 80)}`
      const status = output.workflowStarted ? 'queued' : 'queued (no workflow binding)'
      return `${output.totalItems} item${output.totalItems === 1 ? '' : 's'} ${status} → ${output.jobUrl}`
    },
  },
}

export const batchTaskDefinitions = [
  startBatchTaskDefinition,
] as ToolDefinition<unknown, unknown>[]
