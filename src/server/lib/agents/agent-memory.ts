/**
 * Agent semantic memory via Vectorize
 *
 * Generic helpers any AutonomousAgent subclass can use to wire
 * long-term semantic recall over a Cloudflare Vectorize index.
 *
 * Storage model:
 *   - One shared Vectorize index per fork (binding: AGENT_MEMORY)
 *   - Per-agent scoping via metadata.ownerKey = `${userId}:${agentName}`
 *   - Workers AI BGE Base embeddings (768-dim) — free, no key
 *   - `text` lives in metadata so recall returns it without a side
 *     fetch (Vectorize metadata is small but capped — keep texts <2KB)
 *
 * To enable in a fork:
 *   1. Create the index:
 *      wrangler vectorize create agent-memory --dimensions=768 --metric=cosine
 *   2. Create the metadata indexes (REQUIRED before inserting — see
 *      .claude/rules/cloudflare-vectorize.md):
 *      wrangler vectorize create-metadata-index agent-memory --property-name=ownerKey --type=string
 *   3. Uncomment the AGENT_MEMORY binding in wrangler.jsonc
 *   4. In your AutonomousAgent subclass, override recallSemantic to
 *      call `agentRecall(this.env, ownerKey, input)` and (optionally)
 *      add a `remember` tool that calls `agentRemember(...)`
 *
 * Without the binding, AutonomousAgent's default recallSemantic
 * returns [] — agents work, just without semantic memory.
 *
 * When AgentMemory (Cloudflare's managed service) ships GA, swap this
 * helper's body for the env.MEMORY.recall(...) call. The
 * recallSemantic hook stays the same; subclasses don't change.
 */

export interface AgentMemoryEnv {
  AI: Ai
  AGENT_MEMORY?: VectorizeIndex
}

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5' as const

interface MemoryMetadata {
  ownerKey: string
  text: string
  createdAt: number
  /** Free-form tags for caller-defined filtering (e.g. ['ticket', 'bug']). */
  tags?: string[]
  /** Source identifier (URL, message id, etc) so recall can be traced. */
  source?: string
  /**
   * Importance score 0..100. Used by recall's hybrid scoring formula
   * (see RECALL_WEIGHTS below). Defaults to 50 when not provided.
   * Higher = sticks better against recency decay + irrelevant matches.
   * Set explicitly when storing user-flagged "remember this is important"
   * facts; omit for routine background captures.
   */
  importance?: number
}

/**
 * Hybrid recall scoring weights — replaces pure cosine similarity. The
 * intuition: vector similarity alone treats a year-old, low-importance
 * snippet the same as a fresh, user-flagged one if both happen to embed
 * close to the query. The hybrid formula prefers fresh + important
 * memories at comparable similarity.
 *
 * Weights match OpenSwarm's defaults (see plan doc
 * `.jez/artifacts/skills-and-swarm-plan-2026-05-06.md`). Tunable per
 * fork — change here, not at call sites.
 *
 * Frequency (recall count) is reserved at 0.10 for a future Phase E1.5
 * — Vectorize doesn't natively support per-entry counters without a
 * re-upsert (which requires the original vector), so we defer that
 * implementation. The constant frequency=0 means similarity + importance
 * + recency divide a 0.90 budget today; rebalances when frequency lands.
 */
export const RECALL_WEIGHTS = {
  similarity: 0.55,
  importance: 0.2,
  recency: 0.15,
  frequency: 0.1,
} as const

/** Recency: 1.0 if just created, 0.0 if 90 days old. Linear decay. */
function recencyScore(createdAtSeconds: number): number {
  const ageSeconds = Math.floor(Date.now() / 1000) - createdAtSeconds
  const ageDays = ageSeconds / (60 * 60 * 24)
  return Math.max(0, 1 - ageDays / 90)
}

/** Importance stored as 0-100; normalise to 0-1. Default to 0.5 if absent. */
function importanceScore(importance?: number): number {
  if (importance === undefined) return 0.5
  return Math.max(0, Math.min(1, importance / 100))
}

/**
 * Hybrid score = weighted sum of similarity + importance + recency
 * + frequency. Returns a number in [0, ~1] that sorts higher = more
 * relevant to surface in this turn.
 */
function hybridScore(similarity: number, metadata: MemoryMetadata | undefined): number {
  const sim = Math.max(0, Math.min(1, similarity))
  const imp = importanceScore(metadata?.importance)
  const rec = metadata?.createdAt ? recencyScore(metadata.createdAt) : 0
  // Frequency reserved at 0 until Vectorize counter support lands.
  return (
    RECALL_WEIGHTS.similarity * sim +
    RECALL_WEIGHTS.importance * imp +
    RECALL_WEIGHTS.recency * rec +
    RECALL_WEIGHTS.frequency * 0
  )
}

/**
 * Generate an embedding for `text` using Workers AI BGE Base. Returns
 * a 768-dim vector. The model is free (Workers AI binding) so this
 * has no marginal cost beyond the binding itself.
 */
async function embed(env: AgentMemoryEnv, text: string): Promise<number[]> {
  const result = (await env.AI.run(EMBEDDING_MODEL, { text })) as {
    data: number[][]
    shape?: number[]
  }
  if (!result?.data?.[0]) throw new Error('Embedding model returned no vector')
  return result.data[0]
}

/**
 * Store a text snippet in the agent's semantic memory. Each call
 * creates one Vectorize entry — chunk longer documents before calling.
 *
 * `ownerKey` MUST match the value used for recall — the convention is
 * `${userId}:${agentName}` (which scopes to one agent instance).
 *
 * Returns the entry id so the caller can delete / update later if
 * needed.
 */
export async function agentRemember(
  env: AgentMemoryEnv,
  ownerKey: string,
  text: string,
  opts?: { tags?: string[]; source?: string; importance?: number },
): Promise<{ id: string }> {
  if (!env.AGENT_MEMORY) {
    throw new Error('AGENT_MEMORY binding not configured — see agent-memory.ts setup notes')
  }
  const trimmed = text.slice(0, 2000) // cap for metadata budget
  const vector = await embed(env, trimmed)
  const id = `mem_${crypto.randomUUID()}`
  const metadata: MemoryMetadata = {
    ownerKey,
    text: trimmed,
    createdAt: Math.floor(Date.now() / 1000),
    ...(opts?.tags && { tags: opts.tags }),
    ...(opts?.source && { source: opts.source }),
    ...(opts?.importance !== undefined && {
      importance: Math.max(0, Math.min(100, Math.round(opts.importance))),
    }),
  }
  await env.AGENT_MEMORY.upsert([
    {
      id,
      values: vector,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: metadata as any,
    },
  ])
  return { id }
}

/**
 * Query the agent's semantic memory. Returns the matched text
 * snippets (most-relevant first), filtered by `ownerKey` so one
 * agent never sees another agent's memories.
 *
 * Ranking uses HYBRID scoring (similarity + importance + recency,
 * frequency reserved): see RECALL_WEIGHTS. The `minScore` filter
 * applies to the raw vector similarity — keeps off-topic embeddings
 * out — and hybrid sort then surfaces the most useful within those.
 *
 * `topK` defaults to 5; `minScore` to 0.7 (BGE Base 0..1 — 0.7 is
 * "topically related"). Internally we over-fetch (topK*3) so the
 * hybrid sort has more candidates to choose from before truncation.
 */
export async function agentRecall(
  env: AgentMemoryEnv,
  ownerKey: string,
  query: string,
  opts?: { topK?: number; minScore?: number; tags?: string[] },
): Promise<string[]> {
  if (!env.AGENT_MEMORY) return []
  const topK = opts?.topK ?? 5
  const minScore = opts?.minScore ?? 0.7
  const vector = await embed(env, query)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { ownerKey }
  if (opts?.tags && opts.tags.length > 0) {
    // Vectorize uses an `$in` operator for "any of" matches.
    filter.tags = { $in: opts.tags }
  }
  // Over-fetch so hybrid scoring has headroom — a memory the user
  // recently flagged as important might rank lower on raw similarity
  // alone but should still surface ahead of an older, neutral match.
  const result = await env.AGENT_MEMORY.query(vector, {
    topK: Math.max(topK * 3, 10),
    filter,
    returnMetadata: 'all',
  })
  return result.matches
    .filter((m) => m.score >= minScore)
    .map((m) => ({
      score: hybridScore(m.score, m.metadata as MemoryMetadata | undefined),
      text: (m.metadata as MemoryMetadata | undefined)?.text ?? '',
    }))
    .filter((x) => x.text)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.text)
}

/**
 * Bulk delete an agent's memories. Use on agent reset / user data
 * deletion (GDPR). Vectorize doesn't support delete-by-filter
 * directly — we'd need to query then deleteByIds. For starter purposes
 * we expose the building block and let forks compose. Implementation
 * stub: query top 10000 matching ownerKey, delete by ids.
 */
export async function agentForgetAll(
  env: AgentMemoryEnv,
  ownerKey: string,
): Promise<{ deleted: number }> {
  if (!env.AGENT_MEMORY) return { deleted: 0 }
  // Use a zero vector so the score is meaningless but every match is
  // returned, then filter-by-ownerKey via metadata. Cap at 10000;
  // forks needing more should iterate.
  const zero = new Array(768).fill(0)
  const result = await env.AGENT_MEMORY.query(zero, {
    topK: 10000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter: { ownerKey } as any,
    returnMetadata: 'none',
  })
  const ids = result.matches.map((m) => m.id)
  if (ids.length === 0) return { deleted: 0 }
  await env.AGENT_MEMORY.deleteByIds(ids)
  return { deleted: ids.length }
}
