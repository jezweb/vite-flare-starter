/**
 * Notion tool renderers — search, get_page, get_database, query_database,
 * create_page, append_blocks.
 */
import {
  BookOpen,
  Database,
  FileText,
  Plus,
  Search,
  StickyNote,
} from 'lucide-react'
import type { ToolRenderer } from './_shared'
import { truncate, formatToolDate } from './_shared'
import type {
  NotionSearchOutput,
  NotionGetPageOutput,
  NotionGetDatabaseOutput,
  NotionQueryDatabaseOutput,
  NotionCreatePageOutput,
  NotionAppendBlocksOutput,
} from '@/server/modules/chat/tools/notion'

export const notionSearchRenderer: ToolRenderer = {
  match: 'notion_search',
  icon: Search,
  displayName: 'Notion Search',
  summary: (output) => {
    const o = output as NotionSearchOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    const n = o.count
    if (n === 0) return 'no matches'
    return `${n} ${n === 1 ? 'result' : 'results'}`
  },
  expanded: ({ output, input }) => {
    const o = output as NotionSearchOutput | undefined
    const i = input as { query?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2">
        {i?.query && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Query:</span> {i.query}
          </div>
        )}
        {o.results.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No matches.</div>
        ) : (
          <ul className="divide-y divide-border/60 -mx-2">
            {o.results.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-2 py-1.5">
                {r.object === 'database' ? (
                  <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline truncate flex-1"
                >
                  {r.title || '(untitled)'}
                </a>
                {r.lastEdited && (
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatToolDate(r.lastEdited)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  },
}

export const notionGetPageRenderer: ToolRenderer = {
  match: 'notion_get_page',
  icon: BookOpen,
  displayName: 'Notion Page',
  summary: (output) => {
    const o = output as NotionGetPageOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return truncate(o.title || '(untitled)', 40)
  },
  expanded: ({ output }) => {
    const o = output as NotionGetPageOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{o.title || '(untitled)'}</h3>
          {o.url && (
            <a
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              Open
            </a>
          )}
        </div>
        <div className="rounded-md bg-muted/30 p-2 text-xs whitespace-pre-wrap max-h-80 overflow-y-auto">
          {o.markdown || <span className="text-muted-foreground italic">(empty page)</span>}
        </div>
        {o.hasMoreBlocks && (
          <div className="text-[11px] text-muted-foreground italic">
            This page has more blocks than shown. Ask the agent to read specific child pages if needed.
          </div>
        )}
      </div>
    )
  },
}

export const notionGetDatabaseRenderer: ToolRenderer = {
  match: 'notion_get_database',
  icon: Database,
  displayName: 'Notion Database',
  summary: (output) => {
    const o = output as NotionGetDatabaseOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return `${o.properties.length} columns`
  },
  expanded: ({ output }) => {
    const o = output as NotionGetDatabaseOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{o.title || '(untitled)'}</h3>
          {o.url && (
            <a
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              Open
            </a>
          )}
        </div>
        <ul className="divide-y divide-border/60 -mx-2">
          {o.properties.map((p) => (
            <li key={p.name} className="px-2 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <code className="text-[10px] text-muted-foreground font-mono">
                  {p.type}
                </code>
              </div>
              {p.options && p.options.length > 0 && (
                <div className="text-[11px] text-muted-foreground truncate">
                  Options: {p.options.join(', ')}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    )
  },
}

export const notionQueryDatabaseRenderer: ToolRenderer = {
  match: 'notion_query_database',
  icon: Database,
  displayName: 'Notion Query',
  summary: (output) => {
    const o = output as NotionQueryDatabaseOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return `${o.count} ${o.count === 1 ? 'row' : 'rows'}`
  },
  expanded: ({ output }) => {
    const o = output as NotionQueryDatabaseOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    if (o.rows.length === 0) {
      return <div className="text-xs text-muted-foreground italic">No matching rows.</div>
    }
    return (
      <ul className="divide-y divide-border/60 -mx-2 max-h-80 overflow-y-auto">
        {o.rows.map((r) => (
          <li key={r.id} className="px-2 py-2">
            <div className="flex items-center gap-2">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline truncate flex-1"
              >
                {r.title || '(untitled)'}
              </a>
            </div>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
              {Object.entries(r.properties)
                .filter(([, v]) => v && v !== 'false')
                .slice(0, 6)
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="truncate">{v}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    )
  },
}

export const notionCreatePageRenderer: ToolRenderer = {
  match: 'notion_create_page',
  icon: Plus,
  displayName: 'Notion Create',
  summary: (output) => {
    const o = output as NotionCreatePageOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return 'created'
  },
  expanded: ({ output, input }) => {
    const o = output as NotionCreatePageOutput | undefined
    const i = input as { title?: string; body?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{i?.title ?? 'New page'}</h3>
        {i?.body && (
          <div className="rounded-md bg-muted/30 p-2 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
            {i.body}
          </div>
        )}
        <a
          href={o.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground hover:text-foreground underline"
        >
          Open in Notion
        </a>
      </div>
    )
  },
}

export const notionAppendBlocksRenderer: ToolRenderer = {
  match: 'notion_append_blocks',
  icon: StickyNote,
  displayName: 'Notion Append',
  summary: (output) => {
    const o = output as NotionAppendBlocksOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return `+${o.count} ${o.count === 1 ? 'block' : 'blocks'}`
  },
  expanded: ({ output, input }) => {
    const o = output as NotionAppendBlocksOutput | undefined
    const i = input as { markdown?: string; blockId?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
          Appended {o.count} {o.count === 1 ? 'block' : 'blocks'}
        </div>
        {i?.markdown && (
          <div className="rounded-md bg-muted/30 p-2 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
            {i.markdown}
          </div>
        )}
      </div>
    )
  },
}
