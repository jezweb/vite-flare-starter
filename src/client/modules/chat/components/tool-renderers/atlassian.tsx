/**
 * Atlassian tool renderers — Jira + Confluence.
 */
import {
  CheckSquare,
  FileText,
  MessageSquarePlus,
  MoveRight,
  Plus,
  Search,
  Ticket,
} from 'lucide-react'
import type { ToolRenderer } from './_shared'
import { truncate, formatToolDate } from './_shared'
import type {
  JiraSearchOutput,
  JiraGetOutput,
  JiraCreateOutput,
  JiraCommentOutput,
  JiraTransitionOutput,
  ConfluenceSearchOutput,
  ConfluenceGetOutput,
  ConfluenceCreateOutput,
} from '@/server/modules/chat/tools/atlassian'

export const jiraSearchRenderer: ToolRenderer = {
  match: 'jira_search_issues',
  icon: Search,
  displayName: 'Jira Search',
  summary: (output) => {
    const o = output as JiraSearchOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return `${o.count} of ${o.total}`
  },
  expanded: ({ output, input }) => {
    const o = output as JiraSearchOutput | undefined
    const i = input as { jql?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-2">
        {i?.jql && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">JQL:</span> <span className="font-mono">{i.jql}</span>
          </div>
        )}
        {o.issues.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No matching issues.</div>
        ) : (
          <ul className="divide-y divide-border/60 -mx-2">
            {o.issues.map((it) => (
              <li key={it.key} className="flex flex-col gap-0.5 px-2 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <code className="font-mono text-muted-foreground shrink-0">{it.key}</code>
                  {it.status && (
                    <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                      {it.status}
                    </span>
                  )}
                  {it.updated && (
                    <span className="text-muted-foreground ml-auto shrink-0">
                      {formatToolDate(it.updated)}
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium truncate">{it.summary}</div>
                {it.assignee && (
                  <div className="text-[11px] text-muted-foreground">Assignee: {it.assignee}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  },
}

export const jiraGetIssueRenderer: ToolRenderer = {
  match: 'jira_get_issue',
  icon: Ticket,
  displayName: 'Jira Issue',
  summary: (output) => {
    const o = output as JiraGetOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return o.key
  },
  expanded: ({ output }) => {
    const o = output as JiraGetOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <code className="font-mono text-xs text-muted-foreground">{o.key}</code>
          {o.issueType && (
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
              {o.issueType}
            </span>
          )}
          {o.status && (
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
              {o.status}
            </span>
          )}
        </div>
        <h3 className="text-sm font-semibold">{o.summary}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {o.assignee && (
            <>
              <dt className="text-muted-foreground">Assignee</dt>
              <dd>{o.assignee}</dd>
            </>
          )}
          {o.reporter && (
            <>
              <dt className="text-muted-foreground">Reporter</dt>
              <dd>{o.reporter}</dd>
            </>
          )}
          {o.priority && (
            <>
              <dt className="text-muted-foreground">Priority</dt>
              <dd>{o.priority}</dd>
            </>
          )}
          {o.commentCount != null && (
            <>
              <dt className="text-muted-foreground">Comments</dt>
              <dd>{o.commentCount}</dd>
            </>
          )}
        </dl>
        {o.description && (
          <div className="rounded-md bg-muted/30 p-2 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">
            {o.description}
          </div>
        )}
      </div>
    )
  },
}

export const jiraCreateRenderer: ToolRenderer = {
  match: 'jira_create_issue',
  icon: Plus,
  displayName: 'Jira Create',
  summary: (output) => {
    const o = output as JiraCreateOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return `created ${o.key}`
  },
  expanded: ({ output, input }) => {
    const o = output as JiraCreateOutput | undefined
    const i = input as { summary?: string; projectKey?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-1 text-xs">
        <div>
          <code className="font-mono">{o.key}</code> — {i?.summary}
        </div>
        <a
          href={o.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground underline"
        >
          Open issue
        </a>
      </div>
    )
  },
}

export const jiraCommentRenderer: ToolRenderer = {
  match: 'jira_add_comment',
  icon: MessageSquarePlus,
  displayName: 'Jira Comment',
  summary: (output) => {
    const o = output as JiraCommentOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return 'commented'
  },
  expanded: ({ output, input }) => {
    const o = output as JiraCommentOutput | undefined
    const i = input as { keyOrId?: string; body?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-1 text-xs">
        <div>
          Added comment to <code className="font-mono">{i?.keyOrId}</code>
        </div>
        {i?.body && (
          <div className="rounded-md bg-muted/30 p-2 whitespace-pre-wrap">
            {truncate(i.body, 300)}
          </div>
        )}
      </div>
    )
  },
}

export const jiraTransitionRenderer: ToolRenderer = {
  match: 'jira_transition_issue',
  icon: MoveRight,
  displayName: 'Jira Transition',
  summary: (output) => {
    const o = output as JiraTransitionOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if ('transitioned' in o) return 'transitioned'
    if ('availableTransitions' in o) {
      return `${o.availableTransitions.length} available`
    }
    return null
  },
  expanded: ({ output }) => {
    const o = output as JiraTransitionOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    if ('availableTransitions' in o) {
      return (
        <ul className="divide-y divide-border/60 -mx-2">
          {o.availableTransitions.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-2 py-1.5">
              <span className="text-sm font-medium">{t.name}</span>
              {t.toStatus && (
                <span className="text-[11px] text-muted-foreground">→ {t.toStatus}</span>
              )}
              <code className="ml-auto text-[10px] text-muted-foreground font-mono">{t.id}</code>
            </li>
          ))}
        </ul>
      )
    }
    return (
      <div className="text-xs">
        Transitioned via id <code className="font-mono">{o.transitionId}</code>
      </div>
    )
  },
}

export const confluenceSearchRenderer: ToolRenderer = {
  match: 'confluence_search',
  icon: Search,
  displayName: 'Confluence Search',
  summary: (output) => {
    const o = output as ConfluenceSearchOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return `${o.count} ${o.count === 1 ? 'page' : 'pages'}`
  },
  expanded: ({ output }) => {
    const o = output as ConfluenceSearchOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    if (o.pages.length === 0) {
      return <div className="text-xs text-muted-foreground italic">No matching pages.</div>
    }
    return (
      <ul className="divide-y divide-border/60 -mx-2">
        {o.pages.map((p) => (
          <li key={p.id} className="flex items-center gap-2 px-2 py-1.5">
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate flex-1">{p.title}</span>
            <code className="text-[10px] text-muted-foreground font-mono shrink-0">{p.id}</code>
          </li>
        ))}
      </ul>
    )
  },
}

export const confluenceGetRenderer: ToolRenderer = {
  match: 'confluence_get_page',
  icon: FileText,
  displayName: 'Confluence Page',
  summary: (output) => {
    const o = output as ConfluenceGetOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return truncate(o.title, 40)
  },
  expanded: ({ output }) => {
    const o = output as ConfluenceGetOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{o.title}</h3>
        <div className="rounded-md bg-muted/30 p-2 text-xs whitespace-pre-wrap max-h-80 overflow-y-auto">
          {o.markdown || <span className="text-muted-foreground italic">(empty)</span>}
        </div>
      </div>
    )
  },
}

export const confluenceCreateRenderer: ToolRenderer = {
  match: 'confluence_create_page',
  icon: CheckSquare,
  displayName: 'Confluence Create',
  summary: (output) => {
    const o = output as ConfluenceCreateOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return 'created'
  },
  expanded: ({ output, input }) => {
    const o = output as ConfluenceCreateOutput | undefined
    const i = input as { title?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-1 text-xs">
        <div>Created {i?.title}</div>
        {o.url && (
          <a
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground underline"
          >
            Open page
          </a>
        )}
      </div>
    )
  },
}
