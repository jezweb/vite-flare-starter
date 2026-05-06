/**
 * ProcessBatchWorkflow — durable fan-out over a list of batch_items.
 *
 * Outer loop chunks items into windows of CONCURRENCY (default 8) so we
 * respect AI rate limits + the Workflow CPU budget per step. Inside each
 * window every item is its own `step.do()` so a single failure retries
 * independently and doesn't poison the rest of the batch.
 *
 * AI output is written straight to D1 (`batch_items.result`) inside the
 * step, NOT returned through `step.do()`. Step output is capped at 1MB and
 * a long extraction can blow that easily; D1 has no such limit.
 *
 * Cancellation: if the parent job is set to `cancelled` between steps,
 * the run-loop bails before scheduling more items. Already-running steps
 * finish (we don't kill them mid-call).
 */
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { runModelText } from '@/server/lib/ai/providers'
import { batchItems, batchJobs } from '../db/schema'
import { completeItem, failItem, setJobStatus, startItem } from '../storage'

/** Bindings the Workflow needs to do its job. */
interface WorkflowEnv {
  DB: D1Database
  FILES?: R2Bucket
  AI?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toMarkdown: (
      docs: Array<{ name: string; blob: Blob }>,
    ) => Promise<Array<{ name: string; mimeType: string; format: string; tokens: number; data: string }>>
    run: (...args: unknown[]) => Promise<unknown>
  }
  OPENROUTER_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_AI_API_KEY?: string
  DEEPSEEK_API_KEY?: string
  MISTRAL_API_KEY?: string
  XAI_API_KEY?: string
}

export interface BatchWorkflowParams {
  jobId: string
  /** Override the per-window concurrency. Defaults to 8. */
  concurrency?: number
}

const DEFAULT_CONCURRENCY = 8

export class ProcessBatchWorkflow extends WorkflowEntrypoint<WorkflowEnv, BatchWorkflowParams> {
  async run(event: WorkflowEvent<BatchWorkflowParams>, step: WorkflowStep) {
    const { jobId, concurrency = DEFAULT_CONCURRENCY } = event.payload
    const db = this.env.DB

    // Mark running.
    await step.do('mark-running', async () => {
      await setJobStatus(db, jobId, 'running')
      return { jobId }
    })

    // Load job + items.
    const { job, items } = await step.do('load-items', async () => {
      const d = drizzle(db)
      const [j] = await d.select().from(batchJobs).where(eq(batchJobs.id, jobId)).limit(1)
      if (!j) throw new Error(`Job ${jobId} not found`)
      const its = await d.select().from(batchItems).where(eq(batchItems.jobId, jobId))
      // Strip large fields to fit comfortably under 1MB step-output cap.
      return {
        job: { id: j.id, instruction: j.instruction, model: j.model, taskKind: j.taskKind },
        items: its.map((it) => ({ id: it.id, refKind: it.refKind, refValue: it.refValue, label: it.label })),
      }
    })

    // Process in windows of `concurrency`. Each item is its own step.do so
    // failures retry per-item (max 3 attempts) without rescheduling the
    // whole window.
    for (let i = 0; i < items.length; i += concurrency) {
      // Cooperative cancellation check between windows.
      const stillRunning = await step.do(`check-${i}`, async () => {
        const [j] = await drizzle(db).select().from(batchJobs).where(eq(batchJobs.id, jobId)).limit(1)
        return j?.status === 'running'
      })
      if (!stillRunning) break

      const window = items.slice(i, i + concurrency)
      await Promise.all(
        window.map((item) =>
          step.do(
            `item-${item.id}`,
            { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' }, timeout: '5 minutes' },
            async () => {
              await processOne(this.env, db, job, item)
              return { itemId: item.id }
            },
          ),
        ),
      )
    }

    // Aggregate.
    await step.do('finalize', async () => {
      const d = drizzle(db)
      const [j] = await d.select().from(batchJobs).where(eq(batchJobs.id, jobId)).limit(1)
      if (!j) return { ok: false }
      const finalStatus =
        j.failedItems === 0 ? 'completed' : j.failedItems === j.totalItems ? 'failed' : 'completed'
      const summary = JSON.stringify({
        total: j.totalItems,
        completed: j.completedItems,
        failed: j.failedItems,
      })
      await setJobStatus(db, jobId, finalStatus, summary)
      return { ok: true, finalStatus }
    })
  }
}

async function processOne(
  env: WorkflowEnv,
  db: D1Database,
  job: { id: string; instruction: string; model: string; taskKind: string },
  item: { id: string; refKind: string; refValue: string; label: string | null },
): Promise<void> {
  await startItem(db, item.id)
  try {
    const content = await loadItemContent(env, item)
    const prompt = buildPrompt(job.instruction, job.taskKind, content)

    const text = await runModelText(
      env as unknown as Parameters<typeof runModelText>[0],
      job.model,
      'You are processing one item out of a batch. Follow the user instruction precisely and answer concisely. Return only the result — no preamble, no commentary.',
      prompt,
    )

    await completeItem(db, item.id, text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await failItem(db, item.id, msg)
    // Re-throw so the Workflow step retry kicks in. Once we exceed the
    // retry limit the row stays `failed` and the Workflow moves on.
    throw err
  }
}

interface LoadedContent {
  kind: 'text' | 'image_url' | 'unsupported'
  /** For text: the inline text body. For image_url: a `data:` URL. */
  payload: string
  mimeType?: string
  filename?: string
}

async function loadItemContent(env: WorkflowEnv, item: { refKind: string; refValue: string }): Promise<LoadedContent> {
  if (item.refKind === 'text') {
    return { kind: 'text', payload: item.refValue }
  }
  if (item.refKind === 'url') {
    const resp = await fetch(item.refValue, { headers: { 'User-Agent': 'vite-flare-starter/batch-tasks' } })
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`)
    const text = await resp.text()
    return { kind: 'text', payload: text.slice(0, 200_000), mimeType: 'text/plain' }
  }
  if (item.refKind === 'r2_file') {
    if (!env.FILES) throw new Error('FILES R2 binding not configured')
    const obj = await env.FILES.get(item.refValue)
    if (!obj) throw new Error(`R2 object not found: ${item.refValue}`)
    const mime = obj.httpMetadata?.contentType ?? 'application/octet-stream'
    if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || mime.includes('csv')) {
      const text = await obj.text()
      return { kind: 'text', payload: text.slice(0, 200_000), mimeType: mime }
    }
    if (mime.startsWith('image/')) {
      const buf = await obj.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      return { kind: 'image_url', payload: `data:${mime};base64,${b64}`, mimeType: mime }
    }
    // Documents: convert via Cloudflare's toMarkdown binding. Supports
    // PDF, DOCX, XLSX, PPTX, HTML, RTF, ePub, CSV, and Apple iWork docs.
    // Free, server-side, no per-call cost beyond Workers AI quota.
    if (isConvertibleDocument(mime, item.refValue)) {
      if (!env.AI?.toMarkdown) {
        return {
          kind: 'unsupported',
          payload: `Unsupported file type: ${mime}. AI binding with toMarkdown not available — wire env.AI to enable PDF/DOCX/XLSX support.`,
          mimeType: mime,
        }
      }
      const buf = await obj.arrayBuffer()
      const filename = item.refValue.split('/').pop() ?? 'document'
      const [converted] = await env.AI.toMarkdown([
        { name: filename, blob: new Blob([buf], { type: mime }) },
      ])
      if (!converted?.data) {
        throw new Error(`toMarkdown returned no content for ${filename}`)
      }
      return { kind: 'text', payload: converted.data.slice(0, 200_000), mimeType: 'text/markdown' }
    }
    return {
      kind: 'unsupported',
      payload: `Unsupported file type: ${mime}.`,
      mimeType: mime,
    }
  }
  throw new Error(`Unknown ref_kind: ${item.refKind}`)
}

/**
 * Document mime types Cloudflare's `env.AI.toMarkdown` understands.
 * Source: https://developers.cloudflare.com/workers-ai/markdown-conversion/
 */
function isConvertibleDocument(mime: string, filename: string): boolean {
  const lower = mime.toLowerCase()
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (
    lower === 'application/pdf' ||
    lower === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    lower === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    lower === 'application/msword' ||
    lower === 'application/vnd.ms-excel' ||
    lower === 'application/vnd.ms-powerpoint' ||
    lower === 'application/rtf' ||
    lower === 'application/epub+zip' ||
    lower === 'text/html' ||
    lower === 'application/vnd.apple.pages' ||
    lower === 'application/vnd.apple.numbers' ||
    lower === 'application/vnd.apple.keynote'
  ) {
    return true
  }
  // Fallback to extension when the mime is generic (octet-stream).
  return ['pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'rtf', 'epub', 'pages', 'numbers', 'key'].includes(ext)
}

function buildPrompt(instruction: string, taskKind: string, content: LoadedContent): string {
  if (content.kind === 'unsupported') {
    return `Skipping unsupported content. Reason: ${content.payload}`
  }
  if (content.kind === 'image_url') {
    // Vision-capable models accept the data URL as the text prompt;
    // generateText with vision works via attachments in AI SDK v6, but
    // the simplest reliable shape is to pass it as part of the prompt.
    // For batch tasks, image-bearing items are best handled via Sonnet
    // (supports inline image refs in markdown-style ![](url)).
    return `Task (${taskKind}): ${instruction}\n\nImage to process (mime: ${content.mimeType ?? 'image'}):\n![](${content.payload})`
  }
  return `Task (${taskKind}): ${instruction}\n\n--- Content ---\n${content.payload}`
}
