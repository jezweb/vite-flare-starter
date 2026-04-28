/**
 * Memory tool renderers — `remember`, `recall`, `search_memory`,
 * `search_memories`, `list_all_memories`, `forget`.
 *
 * The agent uses these to read/write its persistent memory blocks.
 * Inline summary makes the chat transcript readable at a glance —
 * "Saved: 'tool-troubleshooting-preference'" instead of "{ id: 'abc' }".
 */
import { Brain, BookOpen, Trash2, ScrollText, Library } from 'lucide-react'
import type { ToolRenderer } from './_shared'
import { truncate } from './_shared'

interface RememberInput {
  text?: string
  tags?: string[]
  source?: string
}

interface RememberOutput {
  ok?: boolean
  id?: string
  error?: string
}

interface RecallInput {
  query?: string
  topK?: number
}

interface RecallOutput {
  results?: Array<{ id?: string; text?: string; score?: number }>
}

const rememberRenderer: ToolRenderer = {
  match: 'remember',
  icon: Brain,
  displayName: 'Save to memory',
  summary: (output, input) => {
    const i = input as RememberInput | undefined
    const o = output as RememberOutput | undefined
    if (o?.error) return `Failed: ${truncate(o.error, 40)}`
    if (i?.text) return truncate(i.text, 70)
    return null
  },
  expanded: ({ output, input }) => {
    const i = input as RememberInput | undefined
    const o = output as RememberOutput | undefined
    return (
      <div className="space-y-2">
        {i?.text && (
          <div className="rounded border bg-muted/30 p-2 text-xs leading-snug">
            {i.text}
          </div>
        )}
        {i?.tags && i.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 text-[11px]">
            {i.tags.map((t) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
        {i?.source && (
          <p className="text-[11px] text-muted-foreground">
            Source: <span className="font-mono">{i.source}</span>
          </p>
        )}
        {o?.error && (
          <p className="text-[11px] text-destructive">{o.error}</p>
        )}
        {o?.id && (
          <p className="text-[10px] text-muted-foreground font-mono">id: {o.id}</p>
        )}
      </div>
    )
  },
}

const recallRenderer: ToolRenderer = {
  match: ['recall', 'search_memory', 'search_memories'],
  icon: BookOpen,
  displayName: 'Recall from memory',
  summary: (output, input) => {
    const i = input as RecallInput | undefined
    const o = output as RecallOutput | undefined
    const count = o?.results?.length ?? 0
    if (i?.query) return `${count} ${count === 1 ? 'result' : 'results'} for "${truncate(i.query, 30)}"`
    return `${count} ${count === 1 ? 'result' : 'results'}`
  },
  expanded: ({ output, input }) => {
    const i = input as RecallInput | undefined
    const o = output as RecallOutput | undefined
    const results = o?.results ?? []
    return (
      <div className="space-y-2">
        {i?.query && (
          <div className="text-xs text-muted-foreground">
            Searched for <span className="font-mono text-foreground">{i.query}</span>
          </div>
        )}
        {results.length === 0 ? (
          <p className="text-xs text-muted-foreground">No matching memories.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-card overflow-hidden">
            {results.slice(0, 10).map((r, idx) => (
              <li key={r.id ?? idx} className="px-3 py-2">
                <p className="text-xs leading-snug">{r.text ?? '(no text)'}</p>
                {r.score != null && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground font-mono">
                    score {r.score.toFixed(3)}
                  </p>
                )}
              </li>
            ))}
            {results.length > 10 && (
              <li className="px-3 py-1.5 text-[11px] text-muted-foreground">
                + {results.length - 10} more
              </li>
            )}
          </ul>
        )}
      </div>
    )
  },
}

const listMemoriesRenderer: ToolRenderer = {
  match: 'list_all_memories',
  icon: Library,
  displayName: 'List all memories',
  summary: (output) => {
    const o = output as { memories?: unknown[] } | undefined
    const count = o?.memories?.length ?? 0
    return `${count} ${count === 1 ? 'memory' : 'memories'}`
  },
}

const sessionStatsRenderer: ToolRenderer = {
  match: 'session_stats',
  icon: ScrollText,
  displayName: 'Session stats',
  summary: (output) => {
    const o = output as { tokens?: number; messages?: number } | undefined
    if (!o) return null
    const parts: string[] = []
    if (o.messages != null) parts.push(`${o.messages} msgs`)
    if (o.tokens != null) parts.push(`${o.tokens} tokens`)
    return parts.join(' · ') || null
  },
}

const forgetRenderer: ToolRenderer = {
  match: 'forget',
  icon: Trash2,
  displayName: 'Forget memory',
  summary: (_output, input) => {
    const i = input as { id?: string; query?: string } | undefined
    if (i?.query) return `Removed: "${truncate(i.query, 50)}"`
    if (i?.id) return `id: ${i.id}`
    return null
  },
}

export const memoryRenderers: ToolRenderer[] = [
  rememberRenderer,
  recallRenderer,
  listMemoriesRenderer,
  sessionStatsRenderer,
  forgetRenderer,
]
