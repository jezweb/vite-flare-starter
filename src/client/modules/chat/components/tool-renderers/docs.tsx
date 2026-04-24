/**
 * Google Docs tool renderers — docs_search, docs_get, docs_create, docs_append.
 */
import { FileText, FileSearch, FilePlus, FilePen, ExternalLink } from 'lucide-react'
import type { ToolRenderer } from './_shared'
import { truncate } from './_shared'
import type {
  DocsSearchOutput,
  DocsGetOutput,
  DocsCreateOutput,
  DocsAppendOutput,
} from '@/server/modules/chat/tools/google-workspace'

function formatModified(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

export const docsSearchRenderer: ToolRenderer = {
  match: 'docs_search',
  icon: FileSearch,
  displayName: 'Docs — Search',
  summary: (output) => {
    const o = output as DocsSearchOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.count === 0) return 'no docs'
    return `${o.count} ${o.count === 1 ? 'doc' : 'docs'}`
  },
  expanded: ({ output, input }) => {
    const o = output as DocsSearchOutput | undefined
    const i = input as { query?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    if (o.docs.length === 0) {
      return (
        <div className="text-xs text-muted-foreground italic">
          No docs matched {i?.query ? <>"{i.query}"</> : 'this query'}.
        </div>
      )
    }
    return (
      <ul className="divide-y divide-border/60 -mx-2">
        {o.docs.map((d) => (
          <li key={d.id} className="flex flex-col gap-0.5 px-2 py-2">
            <div className="flex items-center gap-2">
              <FileText className="size-3.5 text-muted-foreground shrink-0" />
              {d.url ? (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline truncate"
                >
                  {truncate(d.name, 80)}
                </a>
              ) : (
                <span className="text-sm font-medium truncate">{truncate(d.name, 80)}</span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Modified {formatModified(d.modifiedTime)}
              {d.owner ? <> · {d.owner}</> : null}
            </div>
          </li>
        ))}
      </ul>
    )
  },
}

export const docsGetRenderer: ToolRenderer = {
  match: 'docs_get',
  icon: FileText,
  displayName: 'Docs — Read',
  summary: (output) => {
    const o = output as DocsGetOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return truncate(o.title || '(untitled)', 40)
  },
  expanded: ({ output }) => {
    const o = output as DocsGetOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    const preview = o.content.length > 2000 ? o.content.slice(0, 2000) + '…' : o.content
    return (
      <div className="space-y-2 text-xs">
        <div className="text-sm font-semibold">{o.title}</div>
        {o.degraded && (
          <div className="rounded-md bg-amber-500/10 dark:bg-amber-500/15 p-2 text-[11px] text-amber-700 dark:text-amber-400">
            Heading structure lost — content fetched via Drive export fallback.
            Ask the user to reconnect with the `documents.readonly` scope for
            a richer read.
          </div>
        )}
        <pre className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/90 max-h-80 overflow-y-auto">
          {preview}
        </pre>
        <a
          href={`https://docs.google.com/document/d/${o.docId}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-foreground hover:underline"
        >
          Open in Google Docs
          <ExternalLink className="size-3" />
        </a>
      </div>
    )
  },
}

export const docsCreateRenderer: ToolRenderer = {
  match: 'docs_create',
  icon: FilePlus,
  displayName: 'Docs — Create',
  summary: (output) => {
    const o = output as DocsCreateOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.ok) return truncate(o.title, 30)
    return null
  },
  expanded: ({ output, input }) => {
    const o = output as DocsCreateOutput | undefined
    const i = input as { title?: string; content?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2 text-xs">
        <div className="text-sm font-medium">{i?.title ?? o.title}</div>
        {i?.content && (
          <pre className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/90 max-h-60 overflow-y-auto">
            {i.content}
          </pre>
        )}
        {o.url && (
          <a
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-foreground hover:underline"
          >
            Open in Google Docs
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    )
  },
}

export const docsAppendRenderer: ToolRenderer = {
  match: 'docs_append',
  icon: FilePen,
  displayName: 'Docs — Append',
  summary: (output) => {
    const o = output as DocsAppendOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.ok) return `+${o.charsAppended} chars`
    return null
  },
  expanded: ({ output, input }) => {
    const o = output as DocsAppendOutput | undefined
    const i = input as { docId?: string; content?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2 text-xs">
        <div className="text-muted-foreground">Appended to doc {o.docId}</div>
        {i?.content && (
          <pre className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/90 max-h-60 overflow-y-auto">
            {i.content}
          </pre>
        )}
        <a
          href={`https://docs.google.com/document/d/${o.docId}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-foreground hover:underline"
        >
          Open in Google Docs
          <ExternalLink className="size-3" />
        </a>
      </div>
    )
  },
}
