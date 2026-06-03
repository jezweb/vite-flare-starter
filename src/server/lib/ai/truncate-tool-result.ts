/**
 * Tool result truncation
 *
 * Every tool result flows through this before entering the conversation
 * (see `tool-adapter.ts`). The point is to stop a single tool call from
 * blowing the context window — a `gmail_search` returning 500 messages,
 * a SQL query returning 50k rows, an API listing returning the entire
 * catalogue. Without this, the agent loop accumulates raw tool output
 * across turns and can hit the model's input limit in two or three
 * exchanges.
 *
 * Strategy: detect common collection shapes (`rows`, `data`, `items`,
 * `results`, plain arrays), keep the first N items that fit a character
 * budget, and stamp a hint on the result telling the model what
 * happened and what to do next. For non-recognised shapes we fall back
 * to a hard character cut on the JSON serialisation, which is ugly but
 * guarantees the result is bounded.
 *
 * The threshold is intentionally generous (12K chars ≈ 3K tokens) — the
 * goal is to catch unbounded results, not to compress every tool output.
 * Tools that already return small structured summaries are unchanged.
 *
 * Pairs with the optional R2 data-lake spillover (Phase B) — when a
 * DATA_LAKE binding is present, truncated results also get a `data_ref`
 * pointing at the full result, and the agent can call `read_data` /
 * `aggregate_data` / `export_data` to work with it without inflating
 * the conversation.
 */

/**
 * Default character budget for a single tool result. Roughly ~3000
 * tokens at 4 chars/token. Tunable per call site via the helper's opts.
 */
export const DEFAULT_MAX_CHARS = 12_000

/**
 * When truncating an array, this is the cap on items kept in the
 * preview. Even if the budget would allow more, holding 200 rows of
 * tool output in context is rarely useful — the agent should reach
 * for a query/aggregate tool instead.
 */
export const DEFAULT_PREVIEW_ITEMS = 50

/**
 * Common keys we look at when detecting collection shapes. Order
 * matters — the FIRST matching key wins, so put the more specific /
 * conventional names first.
 */
const COLLECTION_KEYS = [
  'rows',
  'data',
  'items',
  'results',
  'records',
  'messages',
  'files',
  'list',
] as const

export interface TruncateOptions {
  /** Max serialised JSON characters allowed before truncation kicks in. */
  maxChars?: number
  /** Cap on items kept in the preview when truncating an array. */
  previewItems?: number
}

export interface TruncateMetadata {
  /** True if the result was modified. */
  truncated: boolean
  /** Total chars in the original (un-truncated) JSON serialisation. */
  originalChars: number
  /** What kind of truncation was applied. */
  kind: 'none' | 'collection' | 'array' | 'string'
  /** When `kind === 'collection'`, the key whose array got truncated. */
  collectionKey?: string
  /** When trimming an array, the original total item count. */
  totalItems?: number
  /** When trimming an array, how many items were kept. */
  keptItems?: number
}

export interface TruncateResult<T = unknown> {
  /** The (possibly truncated) result, ready to send to the model. */
  result: T
  /** Diagnostic metadata about what was done. */
  metadata: TruncateMetadata
}

/**
 * Length of the JSON serialisation, without paying for a second
 * `JSON.stringify` later. Wrapped in try/catch because cyclic /
 * non-serialisable values exist in the wild and shouldn't crash the
 * agent — we just skip truncation and let the upstream handle it.
 */
function safeStringifyLength(value: unknown): number | null {
  try {
    return JSON.stringify(value).length
  } catch {
    return null
  }
}

/**
 * Try to interpret `result` as `{[key]: array}` for one of our known
 * keys. Returns the matching key + array, or null if nothing fits.
 *
 * We require the array to contain at least one element — empty
 * collections aren't worth truncating, and matching them produces
 * confusing metadata.
 */
function detectCollection(result: unknown): { key: string; array: unknown[] } | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  const obj = result as Record<string, unknown>
  for (const key of COLLECTION_KEYS) {
    const value = obj[key]
    if (Array.isArray(value) && value.length > 0) return { key, array: value }
  }
  return null
}

/**
 * Estimate how many leading items of `array` fit in `budget` chars
 * when serialised. Walks the array linearly — cost is O(n) JSONs but
 * each item is bounded so this is fine for the typical few-thousand-row
 * shape we care about. Always returns at least 1 (an empty preview is
 * worse than a single-item one for the model's debugging).
 */
function fitItemsToBudget(array: unknown[], budget: number, cap: number): number {
  let used = 2 // `[]`
  let kept = 0
  const limit = Math.min(array.length, cap)
  for (let i = 0; i < limit; i++) {
    const itemLen = safeStringifyLength(array[i]) ?? 0
    // 1 char for the comma separator after the first item
    const cost = itemLen + (i > 0 ? 1 : 0)
    if (used + cost > budget) break
    used += cost
    kept++
  }
  return Math.max(kept, 1)
}

/**
 * Build the user-visible truncation message. The model reads this and
 * decides what to do next, so it has to be specific and actionable —
 * "Truncated" alone tends to make the model retry the same call.
 */
function truncationMessage(totalItems: number, keptItems: number, hint?: string): string {
  const base = `Returned ${keptItems} of ${totalItems} items. The full result was too large for the conversation.`
  if (hint) return `${base} ${hint}`
  return `${base} If you need more, narrow the query (LIMIT/WHERE/filters) or call read_data / aggregate_data / export_data with the data_ref if one was attached.`
}

/**
 * Truncate a tool result to fit a character budget. See module
 * docstring for design notes.
 */
export function truncateToolResult<T = unknown>(
  result: T,
  opts: TruncateOptions = {}
): TruncateResult<T> {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS
  const previewItems = opts.previewItems ?? DEFAULT_PREVIEW_ITEMS
  const originalChars = safeStringifyLength(result) ?? 0

  // Either we couldn't serialise it (cyclic / non-JSON) or it's
  // already under budget — return untouched.
  if (originalChars === 0 || originalChars <= maxChars) {
    return {
      result,
      metadata: { truncated: false, originalChars, kind: 'none' },
    }
  }

  // Shape 1: known collection key on an object.
  const collection = detectCollection(result)
  if (collection) {
    // Reserve ~1KB for the surrounding object's other keys + our
    // injected metadata ({truncated, total_items, ...}).
    const arrayBudget = Math.max(maxChars - 1000, maxChars * 0.8)
    const kept = fitItemsToBudget(collection.array, arrayBudget, previewItems)
    const truncatedArray = collection.array.slice(0, kept)
    const next = {
      ...(result as Record<string, unknown>),
      [collection.key]: truncatedArray,
      truncated: true,
      total_items: collection.array.length,
      kept_items: kept,
      truncation_message: truncationMessage(collection.array.length, kept),
    }
    return {
      result: next as T,
      metadata: {
        truncated: true,
        originalChars,
        kind: 'collection',
        collectionKey: collection.key,
        totalItems: collection.array.length,
        keptItems: kept,
      },
    }
  }

  // Shape 2: a top-level array.
  if (Array.isArray(result)) {
    // No object envelope — we have to wrap because the model needs
    // somewhere to read the truncation hint.
    const kept = fitItemsToBudget(result, maxChars - 500, previewItems)
    const truncatedArray = result.slice(0, kept)
    const next = {
      data: truncatedArray,
      truncated: true,
      total_items: result.length,
      kept_items: kept,
      truncation_message: truncationMessage(result.length, kept),
    }
    return {
      result: next as unknown as T,
      metadata: {
        truncated: true,
        originalChars,
        kind: 'array',
        totalItems: result.length,
        keptItems: kept,
      },
    }
  }

  // Shape 3: anything else — string, deeply nested object, blob.
  // Hard character cut on the JSON serialisation. Ugly but bounded.
  const json = JSON.stringify(result) ?? ''
  const cut = json.slice(0, Math.max(maxChars - 300, 100))
  const next = {
    truncated: true,
    truncation_message: `Tool result was ${originalChars} chars (max ${maxChars}). Showing first ${cut.length} chars of JSON. Result shape was not a recognised collection — consider returning a structured summary or paginated rows.`,
    preview: cut,
  }
  return {
    result: next as unknown as T,
    metadata: {
      truncated: true,
      originalChars,
      kind: 'string',
    },
  }
}
