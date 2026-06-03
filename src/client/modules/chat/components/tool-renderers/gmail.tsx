/**
 * Gmail tool renderers — gmail_search, gmail_send.
 *
 * gmail_search uses the Phase 0 ToolDefinition contract: the output type
 * is inferred from the server-side Zod schema via `import type`. Vite
 * tree-shakes the server-only code; only the type survives into the
 * client bundle.
 */
import { Mail, MailCheck, MailOpen, MailQuestion, Reply, Tags, Paperclip } from 'lucide-react'
import type { ToolRenderer } from './_shared'
import { truncate, formatToolDate, parseFromHeader } from './_shared'
import type {
  GmailSearchOutput,
  GmailSendOutput,
  GmailGetMessageOutput,
  GmailListLabelsOutput,
  GmailDraftOutput,
  GmailReplyOutput,
} from '@/server/modules/chat/tools/google-workspace'

export const gmailSearchRenderer: ToolRenderer = {
  match: 'gmail_search',
  icon: Mail,
  displayName: 'Gmail Search',
  summary: (output) => {
    const o = output as GmailSearchOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    const n = o.count
    if (n === 0) return 'no matches'
    return `${n} ${n === 1 ? 'message' : 'messages'}`
  },
  expanded: ({ output, input }) => {
    const o = output as GmailSearchOutput | undefined
    const i = input as { query?: string; naturalQuery?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    const messages = o.messages
    const translatedFrom = o.translatedFrom ?? i?.naturalQuery
    const shownQuery = o.query ?? i?.query
    return (
      <div className="space-y-2">
        {translatedFrom && (
          <div className="text-xs">
            <span className="text-muted-foreground font-medium">From:</span>{' '}
            <span className="italic">{translatedFrom}</span>
          </div>
        )}
        {shownQuery && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">{translatedFrom ? 'Translated to:' : 'Query:'}</span>{' '}
            <span className="font-mono">{shownQuery}</span>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            No messages matched this query.
          </div>
        ) : (
          <ul className="divide-y divide-border/60 -mx-2">
            {messages.map((m) => {
              const from = parseFromHeader(m.from)
              return (
                <li key={m.id} className="flex flex-col gap-0.5 px-2 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-foreground truncate">{from.name}</span>
                    <span className="text-muted-foreground ml-auto shrink-0">
                      {formatToolDate(m.date)}
                    </span>
                  </div>
                  <div className="text-sm font-medium truncate">{truncate(m.subject, 100)}</div>
                  {m.snippet && (
                    <div className="text-xs text-muted-foreground line-clamp-2">{m.snippet}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  },
}

export const gmailGetMessageRenderer: ToolRenderer = {
  match: 'gmail_get_message',
  icon: MailOpen,
  displayName: 'Gmail — Read',
  summary: (output) => {
    const o = output as GmailGetMessageOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return truncate(o.subject || '(no subject)', 40)
  },
  expanded: ({ output }) => {
    const o = output as GmailGetMessageOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    const from = parseFromHeader(o.from)
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-sm font-semibold truncate">{o.subject}</div>
          <div className="text-[11px] text-muted-foreground shrink-0">{formatToolDate(o.date)}</div>
        </div>
        <div className="text-xs text-muted-foreground">
          <div>
            <span className="font-medium">From:</span> {from.name}{' '}
            {from.email && <span className="font-mono">{`<${from.email}>`}</span>}
          </div>
          {o.to && (
            <div>
              <span className="font-medium">To:</span> <span className="font-mono">{o.to}</span>
            </div>
          )}
          {o.cc && (
            <div>
              <span className="font-medium">Cc:</span> <span className="font-mono">{o.cc}</span>
            </div>
          )}
        </div>
        {o.hasAttachments && o.attachments && (
          <div className="flex flex-wrap gap-2 text-[11px]">
            {o.attachments.map((a) => (
              <span
                key={a.attachmentId}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
              >
                <Paperclip className="size-3" />
                <span className="font-medium truncate max-w-[180px]">{a.filename}</span>
                <span className="text-muted-foreground">{formatBytes(a.sizeBytes)}</span>
              </span>
            ))}
          </div>
        )}
        {o.body && (
          <div className="rounded-md bg-muted/50 p-3 text-xs whitespace-pre-wrap text-foreground/90 max-h-80 overflow-y-auto">
            {o.body}
          </div>
        )}
      </div>
    )
  },
}

export const gmailListLabelsRenderer: ToolRenderer = {
  match: 'gmail_list_labels',
  icon: Tags,
  displayName: 'Gmail — Labels',
  summary: (output) => {
    const o = output as GmailListLabelsOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return `${o.count} ${o.count === 1 ? 'label' : 'labels'}`
  },
  expanded: ({ output }) => {
    const o = output as GmailListLabelsOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    const sys = o.labels.filter((l) => l.type === 'system')
    const user = o.labels.filter((l) => l.type !== 'system')
    return (
      <div className="space-y-3 text-xs">
        {user.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1">Your labels</div>
            <div className="flex flex-wrap gap-1.5">
              {user.map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center rounded-full bg-muted px-2 py-0.5"
                >
                  {l.name}
                </span>
              ))}
            </div>
          </div>
        )}
        {sys.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1">System</div>
            <div className="flex flex-wrap gap-1.5">
              {sys.map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center rounded-full bg-muted/60 text-muted-foreground px-2 py-0.5"
                >
                  {l.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  },
}

export const gmailDraftRenderer: ToolRenderer = {
  match: 'gmail_draft',
  icon: MailQuestion,
  displayName: 'Gmail — Draft',
  summary: (output) => {
    const o = output as GmailDraftOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.ok) return `draft saved`
    return null
  },
  expanded: ({ output, input }) => {
    const o = output as GmailDraftOutput | undefined
    const i = input as
      | { to?: string; subject?: string; body?: string; cc?: string[]; bcc?: string[] }
      | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-2 text-xs">
        <div className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 dark:bg-amber-500/15 px-2 py-1 text-amber-700 dark:text-amber-400 text-[11px]">
          Draft — not yet sent
        </div>
        <div>
          <span className="text-muted-foreground">To:</span>{' '}
          <span className="font-mono">{i?.to ?? o.to}</span>
        </div>
        {i?.cc && i.cc.length > 0 && (
          <div>
            <span className="text-muted-foreground">Cc:</span>{' '}
            <span className="font-mono">{i.cc.join(', ')}</span>
          </div>
        )}
        {i?.bcc && i.bcc.length > 0 && (
          <div>
            <span className="text-muted-foreground">Bcc:</span>{' '}
            <span className="font-mono">{i.bcc.join(', ')}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Subject:</span>{' '}
          <span>{i?.subject ?? o.subject}</span>
        </div>
        {i?.body && (
          <div className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap text-foreground/90 max-h-64 overflow-y-auto">
            {i.body}
          </div>
        )}
      </div>
    )
  },
}

export const gmailReplyRenderer: ToolRenderer = {
  match: 'gmail_reply',
  icon: Reply,
  displayName: 'Gmail — Reply',
  summary: (output) => {
    const o = output as GmailReplyOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.ok) return `replied · ${truncate(o.to, 25)}`
    return null
  },
  expanded: ({ output, input }) => {
    const o = output as GmailReplyOutput | undefined
    const i = input as { body?: string; replyAll?: boolean } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-2 text-xs">
        <div>
          <span className="text-muted-foreground">Replied to:</span>{' '}
          <span className="font-mono">{o.to}</span>
          {i?.replyAll && (
            <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px]">
              reply-all
            </span>
          )}
        </div>
        {i?.body && (
          <div className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap text-foreground/90 max-h-64 overflow-y-auto">
            {i.body}
          </div>
        )}
      </div>
    )
  },
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export const gmailSendRenderer: ToolRenderer = {
  match: 'gmail_send',
  icon: MailCheck,
  displayName: 'Gmail Send',
  summary: (output) => {
    const o = output as GmailSendOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    if (o.ok) return 'sent'
    return null
  },
  expanded: ({ output, input }) => {
    const o = output as GmailSendOutput | undefined
    const i = input as { to?: string; subject?: string; body?: string; cc?: string[] } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-2 text-xs">
        <div>
          <span className="text-muted-foreground">To:</span>{' '}
          <span className="font-mono">{i?.to ?? o.to}</span>
        </div>
        {i?.cc && i.cc.length > 0 && (
          <div>
            <span className="text-muted-foreground">Cc:</span>{' '}
            <span className="font-mono">{i.cc.join(', ')}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Subject:</span>{' '}
          <span>{i?.subject ?? o.subject}</span>
        </div>
        {i?.body && (
          <div className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap text-foreground/90 max-h-64 overflow-y-auto">
            {i.body}
          </div>
        )}
      </div>
    )
  },
}
