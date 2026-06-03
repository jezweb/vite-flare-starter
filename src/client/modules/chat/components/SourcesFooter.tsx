/**
 * SourcesFooter — compact citation strip beneath an assistant message.
 *
 * Aggregates URL/document sources from:
 *  - Native AI SDK `source-url` / `source-document` UIMessage parts (model-emitted,
 *    e.g. Gemini with googleSearch grounding when `sendSources: true`).
 *  - Tool outputs the client already knows how to read: web_search,
 *    gmail_search, drive_search, places_search.
 *
 * Doesn't touch tool output schemas — it extracts from the same data the
 * tool renderers already display, then presents it as a claude.ai-style
 * "Sources" row so users can see what the model consulted without expanding
 * every tool card.
 */
import { memo, useMemo, useState } from 'react'
import { Globe, Mail, FileText, MapPin, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Source {
  kind: 'web' | 'gmail' | 'drive' | 'places' | 'document'
  title: string
  url?: string
  hint?: string
  /** Stable de-dup key: prefer url; fall back to kind+title. */
  key: string
}

interface SourcesFooterProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parts: any[]
}

const KIND_ICON: Record<Source['kind'], LucideIcon> = {
  web: Globe,
  gmail: Mail,
  drive: FileText,
  places: MapPin,
  document: FileText,
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function faviconFor(url: string): string | null {
  const host = hostnameOf(url)
  if (!host) return null
  return `https://www.google.com/s2/favicons?domain=${host}&sz=32`
}

/**
 * Walk message parts and extract sources. Each tool shape is matched
 * defensively — anything we don't recognise is silently skipped so a
 * schema change upstream never breaks rendering.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSources(parts: any[]): Source[] {
  const sources: Source[] = []
  const seen = new Set<string>()

  const push = (s: Source) => {
    if (seen.has(s.key)) return
    seen.add(s.key)
    sources.push(s)
  }

  for (const part of parts) {
    if (!part || typeof part !== 'object') continue

    // 1. Native SDK source parts (model-emitted)
    if (part.type === 'source-url') {
      const url = part.url as string | undefined
      if (!url) continue
      push({
        kind: 'web',
        title: (part.title as string) || hostnameOf(url) || url,
        url,
        hint: hostnameOf(url) ?? undefined,
        key: `url:${url}`,
      })
      continue
    }
    if (part.type === 'source-document') {
      const title = (part.title as string) || 'Document'
      const filename = part.filename as string | undefined
      push({
        kind: 'document',
        title,
        hint: filename,
        key: `doc:${part.sourceId ?? title}`,
      })
      continue
    }

    // 2. Tool outputs — only successful outputs with a known shape
    if (typeof part.type !== 'string' || !part.type.startsWith('tool-')) continue
    if (part.state !== 'output-available') continue

    const toolName = part.type.slice('tool-'.length)
    const output = part.output
    if (!output || typeof output !== 'object') continue

    // web_search / search
    if (toolName === 'web_search' || toolName === 'search') {
      const results = (output as { results?: unknown }).results
      if (!Array.isArray(results)) continue
      for (const r of results) {
        if (!r || typeof r !== 'object') continue
        const url = (r as { url?: string }).url
        const title = (r as { title?: string }).title
        if (!url) continue
        push({
          kind: 'web',
          title: title || hostnameOf(url) || url,
          url,
          hint: hostnameOf(url) ?? undefined,
          key: `web:${url}`,
        })
      }
      continue
    }

    // gmail_search
    if (toolName === 'gmail_search') {
      const messages = (output as { messages?: unknown }).messages
      if (!Array.isArray(messages)) continue
      for (const m of messages) {
        if (!m || typeof m !== 'object') continue
        const id = (m as { id?: string }).id
        const subject = (m as { subject?: string }).subject
        const from = (m as { from?: string }).from
        if (!id) continue
        push({
          kind: 'gmail',
          title: subject || '(no subject)',
          url: `https://mail.google.com/mail/u/0/#inbox/${id}`,
          hint: from,
          key: `gmail:${id}`,
        })
      }
      continue
    }

    // drive_search
    if (toolName === 'drive_search') {
      const files = (output as { files?: unknown }).files
      if (!Array.isArray(files)) continue
      for (const f of files) {
        if (!f || typeof f !== 'object') continue
        const id = (f as { id?: string }).id
        const name = (f as { name?: string }).name
        const url = (f as { url?: string }).url
        if (!id && !url) continue
        push({
          kind: 'drive',
          title: name || 'Untitled file',
          url,
          hint: (f as { mimeType?: string }).mimeType,
          key: `drive:${id ?? url}`,
        })
      }
      continue
    }

    // places_search
    if (toolName === 'places_search') {
      const places = (output as { places?: unknown }).places
      if (!Array.isArray(places)) continue
      for (const p of places) {
        if (!p || typeof p !== 'object') continue
        const placeId = (p as { placeId?: string }).placeId
        const name = (p as { name?: string }).name
        const website = (p as { website?: string }).website
        const mapUrl = (p as { googleMapsUrl?: string }).googleMapsUrl
        if (!placeId) continue
        push({
          kind: 'places',
          title: name || 'Place',
          url: website || mapUrl,
          hint: (p as { address?: string }).address,
          key: `places:${placeId}`,
        })
      }
      continue
    }
  }

  return sources
}

const COLLAPSE_THRESHOLD = 8

export const SourcesFooter = memo(function SourcesFooter({ parts }: SourcesFooterProps) {
  const sources = useMemo(() => extractSources(parts), [parts])
  const [expanded, setExpanded] = useState(false)
  if (sources.length === 0) return null

  const overThreshold = sources.length > COLLAPSE_THRESHOLD
  const visible = !expanded && overThreshold ? sources.slice(0, COLLAPSE_THRESHOLD) : sources

  return (
    <div className="mt-2 border-t border-border/50 pt-3">
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Sources ({sources.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {visible.map((s) => {
          const Icon = KIND_ICON[s.kind]
          const favicon = s.url && s.kind === 'web' ? faviconFor(s.url) : null
          const content = (
            <div
              className={cn(
                'inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs',
                'max-w-[320px] transition-colors',
                s.url && 'hover:bg-muted hover:border-border'
              )}
            >
              {favicon ? (
                <img
                  src={favicon}
                  alt=""
                  className="size-3.5 shrink-0 rounded-sm"
                  onError={(e) => {
                    // Hide broken favicon, show icon fallback
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate font-medium">{s.title}</span>
              {s.hint && <span className="truncate text-muted-foreground">· {s.hint}</span>}
            </div>
          )
          return s.url ? (
            <a
              key={s.key}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            >
              {content}
            </a>
          ) : (
            <div key={s.key}>{content}</div>
          )
        })}
        {overThreshold && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              'inline-flex items-center rounded-md border border-dashed bg-muted/20 px-2 py-1 text-xs',
              'hover:bg-muted hover:border-border text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            aria-expanded={expanded}
          >
            {expanded ? 'Show less' : `+${sources.length - COLLAPSE_THRESHOLD} more`}
          </button>
        )}
      </div>
    </div>
  )
})
