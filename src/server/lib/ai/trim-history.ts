/**
 * Conversation history trimming
 *
 * The AI SDK's `useChat` sends the FULL message history to the server on
 * every turn. That's fine for short conversations, ruinous for long ones
 * — a 60-message thread with a few large tool results compounds across
 * turns until the model rejects the input.
 *
 * This module trims the incoming UIMessage array to a token budget,
 * with three strategies:
 *
 *   1. Always keep the most recent N turns verbatim (the model needs
 *      the immediate context to be coherent).
 *   2. Drop older messages until the total fits the budget.
 *   3. If an OpenRouter key is available, summarise the dropped
 *      messages with Haiku 4.5 and prepend the summary as a synthetic
 *      assistant note so the model knows what was discussed earlier.
 *      Without a key we just drop and add a "[N earlier messages
 *      omitted]" marker — the model will lack older context but won't
 *      hallucinate.
 *
 * The trim uses chars-per-token = 4 as a coarse estimate. We don't
 * call `count_tokens` because (a) it's another API round-trip per
 * turn, (b) the budget is a soft target, not a hard limit, and (c) the
 * AI SDK's input-counting kicks in downstream as the safety net.
 *
 * **Pairs with #30** — once Phase A truncation + R2 spillover are in
 * place, individual tool results are bounded. This module then
 * bounds the *cumulative* growth across turns, completing the
 * defence-in-depth.
 */

const DEFAULT_MAX_TOKENS = 80_000
const CHARS_PER_TOKEN = 4
/** Always keep the most recent N messages verbatim — never trim
 *  active context. Two = the user's latest turn + the assistant's
 *  most recent reply. */
const DEFAULT_KEEP_RECENT = 2
/** When summarising, cap the size of the input we send to Haiku.
 *  Beyond this we summarise the LAST N chars of the dropped block —
 *  the older messages are less load-bearing anyway. */
const SUMMARY_INPUT_CHAR_CAP = 60_000

/**
 * Subset of the AI SDK `UIMessage` shape we actually inspect. Kept
 * structural so callers can pass either UIMessages from `@ai-sdk/react`
 * or the looser `body.messages` shape that the chat route receives.
 */
interface TrimmableMessage {
  id?: string
  role: string
  content?: unknown
  parts?: unknown[]
}

export interface TrimOptions {
  /** Max input tokens for the trimmed history. Default 80_000. */
  maxTokens?: number
  /** Always keep the most recent N messages verbatim. Default 2. */
  keepRecent?: number
  /** OpenRouter API key — when present, the trim summarises dropped
   *  messages with Haiku 4.5 instead of just dropping them. */
  openRouterApiKey?: string
  /** Override the default summary model. Useful for testing or for
   *  forks that prefer a different summariser. */
  summaryModel?: string
}

export interface TrimResult<M extends TrimmableMessage> {
  messages: M[]
  /** True if any messages were dropped / summarised. */
  trimmed: boolean
  /** How many original messages were rolled into the summary block. */
  droppedCount: number
  /** Estimated input tokens of the trimmed result. */
  estimatedTokens: number
  /** The summary text injected (if any). */
  summary?: string
}

/**
 * Pull plain text out of a UIMessage. Handles both legacy `content`
 * shape and the parts-based UIMessage shape (text/reasoning/tool-input/
 * tool-output parts). Tool input/output get their JSON serialisations
 * since that's what the model consumes.
 */
function estimateMessageChars(msg: TrimmableMessage): number {
  let total = msg.role.length + 4 // 4 = role separator overhead
  if (typeof msg.content === 'string') {
    total += msg.content.length
  }
  if (Array.isArray(msg.parts)) {
    for (const part of msg.parts) {
      if (!part || typeof part !== 'object') continue
      const p = part as Record<string, unknown>
      if (typeof p['text'] === 'string') total += (p['text'] as string).length
      if (typeof p['reasoning'] === 'string') total += (p['reasoning'] as string).length
      if (p['input'] !== undefined) {
        try {
          total += JSON.stringify(p['input']).length
        } catch {
          /* skip */
        }
      }
      if (p['output'] !== undefined) {
        try {
          total += JSON.stringify(p['output']).length
        } catch {
          /* skip */
        }
      }
      if (typeof p['url'] === 'string') total += (p['url'] as string).length
    }
  }
  return total
}

/**
 * Render a message as a single line for the summariser. Strips parts
 * structure into "role: text|tool_call|tool_result" so Haiku can read
 * it as a transcript without the noise.
 */
function renderMessageForSummary(msg: TrimmableMessage): string {
  const role = msg.role
  if (typeof msg.content === 'string') return `${role}: ${msg.content.slice(0, 2000)}`
  if (Array.isArray(msg.parts)) {
    const fragments: string[] = []
    for (const part of msg.parts) {
      if (!part || typeof part !== 'object') continue
      const p = part as Record<string, unknown>
      const type = String(p['type'] ?? '')
      if (type === 'text' && typeof p['text'] === 'string') {
        fragments.push((p['text'] as string).slice(0, 2000))
      } else if (type === 'reasoning' && typeof p['reasoning'] === 'string') {
        fragments.push(`[reasoning: ${(p['reasoning'] as string).slice(0, 500)}]`)
      } else if (type.startsWith('tool-')) {
        const toolName = type.slice('tool-'.length)
        fragments.push(`[tool ${toolName}]`)
      } else if (type === 'file') {
        fragments.push(`[file: ${String(p['mediaType'] ?? 'unknown')}]`)
      }
    }
    return `${role}: ${fragments.join(' | ').slice(0, 3000)}`
  }
  return `${role}: [empty]`
}

/**
 * Summarise a block of messages with Haiku 4.5 via OpenRouter. Returns
 * null on any failure — the caller drops the block silently in that
 * case. We deliberately don't surface the error to the user; a missing
 * summary is a soft degradation, not a chat-breaking error.
 */
async function summariseWithHaiku(
  dropped: TrimmableMessage[],
  apiKey: string,
  modelOverride?: string
): Promise<string | null> {
  try {
    let transcript = dropped.map(renderMessageForSummary).join('\n')
    if (transcript.length > SUMMARY_INPUT_CHAR_CAP) {
      // Keep the tail — recent dropped messages have more bearing on
      // current context than the very oldest ones.
      transcript = `…[older history truncated]…\n${transcript.slice(-SUMMARY_INPUT_CHAR_CAP)}`
    }
    const { generateText } = await import('ai')
    const { createOpenRouter } = await import('@openrouter/ai-sdk-provider')
    const openrouter = createOpenRouter({ apiKey })
    const model = modelOverride ?? 'anthropic/claude-haiku-4.5'
    const result = await generateText({
      model: openrouter(model),
      prompt:
        'Summarise the following conversation transcript in 2-3 dense sentences. Capture: key facts the user shared, decisions reached, what tools were used and what they revealed, and any open threads. Be specific about names, numbers, and identifiers — the user may reference them later.\n\n' +
        '---\n' +
        transcript +
        '\n---\n\n' +
        'Summary:',
      maxOutputTokens: 250,
    })
    const summary = result.text?.trim()
    return summary || null
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'trim_history_summary_failed',
        error: err instanceof Error ? err.message : String(err),
      })
    )
    return null
  }
}

/**
 * Build a synthetic UI message that carries the summary into the
 * conversation. Uses role=user with a clearly-marked text part so the
 * model treats it as system-style context rather than a real user turn.
 * (Anthropic-style chat APIs don't accept a plain `system` role mid-
 * conversation; injecting as a user message with the marker is the
 * portable equivalent.)
 */
function buildSummaryMessage<M extends TrimmableMessage>(summary: string, droppedCount: number): M {
  return {
    id: `summary-${Date.now()}`,
    role: 'user',
    parts: [
      {
        type: 'text',
        text: `[Earlier conversation summary — ${droppedCount} messages compacted to save context]\n\n${summary}\n\n[End summary. Continue from the next message below.]`,
      },
    ],
  } as unknown as M
}

/** Same idea, used when no API key is available — drop the block but
 *  leave a marker so the model knows context is missing. */
function buildOmissionMessage<M extends TrimmableMessage>(droppedCount: number): M {
  return {
    id: `omission-${Date.now()}`,
    role: 'user',
    parts: [
      {
        type: 'text',
        text: `[${droppedCount} earlier messages omitted to fit context budget. Ask the user for clarification if you need older context.]`,
      },
    ],
  } as unknown as M
}

/**
 * Trim a UIMessage history to fit a token budget. See module docstring
 * for design notes.
 *
 * Cost note: when summarisation fires, it makes ONE Haiku call per
 * trim invocation. The chat route should only call this once per turn,
 * so cost is bounded to one Haiku call per turn for conversations that
 * exceed the budget — typically <$0.001 per call. Cheaper than the
 * input-token cost of NOT trimming.
 */
export async function trimHistoryToTokenBudget<M extends TrimmableMessage>(
  messages: M[],
  opts: TrimOptions = {}
): Promise<TrimResult<M>> {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS
  const keepRecent = Math.max(1, opts.keepRecent ?? DEFAULT_KEEP_RECENT)
  const maxChars = maxTokens * CHARS_PER_TOKEN

  // Cheap pass — no work to do if we're already under budget.
  let totalChars = 0
  for (const m of messages) totalChars += estimateMessageChars(m)
  if (totalChars <= maxChars || messages.length <= keepRecent + 1) {
    return {
      messages,
      trimmed: false,
      droppedCount: 0,
      estimatedTokens: Math.ceil(totalChars / CHARS_PER_TOKEN),
    }
  }

  // Walk from the front, dropping until we're under budget — but never
  // touch the trailing `keepRecent` messages.
  const kept = [...messages]
  const dropped: M[] = []
  while (totalChars > maxChars && kept.length > keepRecent) {
    const removed = kept.shift()!
    totalChars -= estimateMessageChars(removed)
    dropped.push(removed)
  }

  if (dropped.length === 0) {
    return {
      messages,
      trimmed: false,
      droppedCount: 0,
      estimatedTokens: Math.ceil(totalChars / CHARS_PER_TOKEN),
    }
  }

  // Optional summary pass.
  let summary: string | null = null
  if (opts.openRouterApiKey) {
    summary = await summariseWithHaiku(dropped, opts.openRouterApiKey, opts.summaryModel)
  }

  const synthetic = summary
    ? buildSummaryMessage<M>(summary, dropped.length)
    : buildOmissionMessage<M>(dropped.length)
  const finalMessages = [synthetic, ...kept]
  // Recompute final size — the synthetic message has its own char cost.
  const finalChars = finalMessages.reduce((acc, m) => acc + estimateMessageChars(m), 0)

  return {
    messages: finalMessages,
    trimmed: true,
    droppedCount: dropped.length,
    estimatedTokens: Math.ceil(finalChars / CHARS_PER_TOKEN),
    summary: summary ?? undefined,
  }
}
