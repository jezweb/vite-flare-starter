/**
 * find_tools renderer — Tool Search results.
 *
 * `find_tools` is the progressive-disclosure entry point for the agent
 * tool catalogue: agent gets ~10 core tools + this one, the rest load
 * on demand. It fires often, so a friendly inline summary is high
 * leverage.
 *
 * Renders as a compact list of matched tool names + descriptions
 * instead of the raw JSON dump.
 */
import { Search } from 'lucide-react'
import type { ToolRenderer } from './_shared'

interface FindToolsInput {
  query?: string
}

interface ToolMatch {
  name: string
  description?: string
}

interface FindToolsOutput {
  matches?: ToolMatch[]
}

function toFindToolsOutput(value: unknown): FindToolsOutput | null {
  if (!value || typeof value !== 'object') return null
  return value as FindToolsOutput
}

export const findToolsRenderer: ToolRenderer = {
  match: 'find_tools',
  icon: Search,
  displayName: 'Find tools',
  summary: (output, input) => {
    const out = toFindToolsOutput(output)
    const i = input as FindToolsInput | undefined
    const count = out?.matches?.length ?? 0
    const query = i?.query ? `"${i.query}"` : 'tools'
    return `${count} ${count === 1 ? 'match' : 'matches'} for ${query}`
  },
  expanded: ({ output, input }) => {
    const out = toFindToolsOutput(output)
    const matches = out?.matches ?? []
    const i = input as FindToolsInput | undefined
    return (
      <div className="space-y-2">
        {i?.query && (
          <div className="text-xs text-muted-foreground">
            Searched for{' '}
            <span className="font-mono text-foreground">{i.query}</span>
          </div>
        )}
        {matches.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tools matched.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-card overflow-hidden">
            {matches.slice(0, 20).map((m) => (
              <li key={m.name} className="px-3 py-2">
                <div className="font-mono text-xs">{m.name}</div>
                {m.description && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                    {m.description}
                  </p>
                )}
              </li>
            ))}
            {matches.length > 20 && (
              <li className="px-3 py-1.5 text-[11px] text-muted-foreground">
                + {matches.length - 20} more
              </li>
            )}
          </ul>
        )}
      </div>
    )
  },
}
