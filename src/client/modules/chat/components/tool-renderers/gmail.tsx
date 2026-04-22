/**
 * Gmail tool renderers — gmail_search, gmail_send.
 *
 * gmail_search uses the Phase 0 ToolDefinition contract: the output type
 * is inferred from the server-side Zod schema via `import type`. Vite
 * tree-shakes the server-only code; only the type survives into the
 * client bundle.
 */
import { Mail, MailCheck } from 'lucide-react'
import type { ToolRenderer } from './_shared'
import { truncate, formatToolDate, parseFromHeader } from './_shared'
import type {
  GmailSearchOutput,
  GmailSendOutput,
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
    const i = input as { query?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
      )
    }
    const messages = o.messages
    return (
      <div className="space-y-2">
        {i?.query && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Query:</span>{' '}
            <span className="font-mono">{i.query}</span>
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
                    <span className="font-medium text-foreground truncate">
                      {from.name}
                    </span>
                    <span className="text-muted-foreground ml-auto shrink-0">
                      {formatToolDate(m.date)}
                    </span>
                  </div>
                  <div className="text-sm font-medium truncate">
                    {truncate(m.subject, 100)}
                  </div>
                  {m.snippet && (
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {m.snippet}
                    </div>
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
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">
          {o.error}
        </div>
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
