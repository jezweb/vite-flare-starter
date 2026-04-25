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
  opts?: { tags?: string[]; source?: string },
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
 * `topK` defaults to 5; `minScore` to 0.7 (BGE Base produces scores
 * 0..1 — 0.7 is "topically related"). Tune per use case.
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
  const result = await env.AGENT_MEMORY.query(vector, {
    topK,
    filter,
    returnMetadata: 'all',
  })
  return result.matches
    .filter((m) => m.score >= minScore)
    .map((m) => {
      const md = m.metadata as MemoryMetadata | undefined
      return md?.text ?? ''
    })
    .filter(Boolean)
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
