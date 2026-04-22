/**
 * WebSearchResults — claude.ai-style rendering for `web_search` tool output.
 *
 * Shape produced by `webSearchDefinition` in server/chat/tools/search.ts:
 *   { query: string, results: { title, url, snippet, date? }[], count: number }
 *
 * Visual:
 *  - Header row: globe icon + query text + "N results" + chevron toggle
 *  - Body: stacked result rows with favicon + title + domain
 *  - Each row is a link that opens in a new tab
 *  - Collapsed state hides the body so long result lists don't dominate the
 *    transcript
 */
import { useState, useMemo } from 'react'
import { Globe, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface WebSearchOutput {
  query: string
  results: { title: string; url: string; snippet: string; date?: string }[]
  count: number
  provider?: string
  error?: string
}

/** Shape guard — detects a `web_search` tool result from its duck-typed payload. */
export function isWebSearchOutput(output: unknown): output is WebSearchOutput {
  if (!output || typeof output !== 'object') return false
  const o = output as Record<string, unknown>
  return typeof o['query'] === 'string' && Array.isArray(o['results'])
}

/**
 * Extract an apex-ish domain name for display ("medium.com", "github.com",
 * "ccs.kaitran.ca") without the "www." prefix.
 */
function displayDomain(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Build a favicon URL via Google's `/s2/favicons` CDN. 32px is a sensible
 * default for retina @ 16px display size. Returns empty string for invalid
 * URLs so the `<img>` simply fails to load and we fall back to the globe.
 */
function faviconUrl(url: string): string {
  const d = displayDomain(url)
  if (!d) return ''
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=32`
}

interface Props {
  output: WebSearchOutput
}

export function WebSearchResults({ output }: Props) {
  const [open, setOpen] = useState(true)
  const results = output.results ?? []

  // De-dupe by hostname so the top-of-results row doesn't show 5 medium.com
  // results (common pattern when Google's SERP includes multiple Medium posts).
  const deduped = useMemo(() => {
    const seen = new Set<string>()
    const out: typeof results = []
    for (const r of results) {
      const host = displayDomain(r.url)
      // Keep more than one per host but still collapse obvious noise.
      const key = `${host}|${r.title.toLowerCase().slice(0, 40)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(r)
    }
    return out
  }, [results])

  if (output.error) {
    return (
      <div className="my-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        Search failed: {output.error}
      </div>
    )
  }

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'group flex w-full items-center gap-2 rounded-md px-1 py-1 text-left',
          'text-muted-foreground hover:text-foreground transition-colors',
        )}
        aria-expanded={open}
      >
        <Globe className="size-4 shrink-0" />
        <span className="text-sm min-w-0 truncate text-foreground/90">{output.query}</span>
        <span className="ml-auto shrink-0 text-xs tabular-nums">
          {output.count} result{output.count === 1 ? '' : 's'}
        </span>
        {open ? (
          <ChevronUp className="size-3.5 shrink-0" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0" />
        )}
      </button>

      {open && deduped.length > 0 && (
        <div className="mt-1 overflow-hidden rounded-lg border border-border/80 bg-muted/20">
          <ul className="max-h-72 overflow-y-auto divide-y divide-border/60">
            {deduped.map((r, i) => {
              const domain = displayDomain(r.url)
              const fav = faviconUrl(r.url)
              return (
                <li key={i}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent/40 transition-colors"
                    title={r.snippet || r.title}
                  >
                    {/* Light neutral tile so white/monochrome favicons stay
                        visible in dark mode. Without it, single-colour icons
                        like Anthropic's disappear against our near-black bg. */}
                    <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white ring-1 ring-border/40">
                      {fav ? (
                        // eslint-disable-next-line jsx-a11y/alt-text
                        <img
                          src={fav}
                          width={16}
                          height={16}
                          alt=""
                          className="size-4 object-contain"
                          loading="lazy"
                          onError={(e) => {
                            // Fallback to the globe icon if the favicon 404s.
                            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <Globe className="size-3.5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {r.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {domain}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
