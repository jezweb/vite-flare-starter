/**
 * Slack tool renderers — search, list channels, history, user, post.
 *
 * Types are imported from the server module via `import type` — Vite
 * tree-shakes the server-only code and the runtime bundle stays small.
 */
import { Hash, Lock, MessageSquare, Search, Send, User } from 'lucide-react'
import type { ToolRenderer } from './_shared'
import { truncate, formatToolDate } from './_shared'
import type {
  SlackSearchMessagesOutput,
  SlackListChannelsOutput,
  SlackGetChannelHistoryOutput,
  SlackGetUserOutput,
  SlackPostMessageOutput,
} from '@/server/modules/chat/tools/slack'

/** Slack ts (seconds.micros) → Date. */
function tsToDate(ts: string | undefined): string {
  if (!ts) return ''
  const seconds = Number(ts.split('.')[0])
  if (!Number.isFinite(seconds)) return ''
  return formatToolDate(new Date(seconds * 1000).toISOString())
}

export const slackSearchMessagesRenderer: ToolRenderer = {
  match: 'slack_search_messages',
  icon: Search,
  displayName: 'Slack Search',
  summary: (output) => {
    const o = output as SlackSearchMessagesOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    const n = o.count
    if (n === 0) return 'no matches'
    return `${n} ${n === 1 ? 'message' : 'messages'}`
  },
  expanded: ({ output, input }) => {
    const o = output as SlackSearchMessagesOutput | undefined
    const i = input as { query?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-2">
        {i?.query && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Query:</span> <span className="font-mono">{i.query}</span>
          </div>
        )}
        {o.messages.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            No messages matched this query.
          </div>
        ) : (
          <ul className="divide-y divide-border/60 -mx-2">
            {o.messages.map((m, idx) => (
              <li key={`${m.ts}-${idx}`} className="flex flex-col gap-0.5 px-2 py-2">
                <div className="flex items-center gap-2 text-xs">
                  {m.channel && (
                    <span className="font-mono text-muted-foreground shrink-0">{m.channel}</span>
                  )}
                  <span className="text-muted-foreground ml-auto shrink-0">{tsToDate(m.ts)}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap line-clamp-3">
                  {truncate(m.text, 400)}
                </div>
                {m.permalink && (
                  <a
                    href={m.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-muted-foreground hover:text-foreground underline"
                  >
                    Open in Slack
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  },
}

export const slackListChannelsRenderer: ToolRenderer = {
  match: 'slack_list_channels',
  icon: Hash,
  displayName: 'Slack Channels',
  summary: (output) => {
    const o = output as SlackListChannelsOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    const n = o.count
    return `${n} ${n === 1 ? 'channel' : 'channels'}`
  },
  expanded: ({ output }) => {
    const o = output as SlackListChannelsOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <ul className="divide-y divide-border/60 -mx-2 max-h-80 overflow-y-auto">
        {o.channels.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-2 py-1.5">
            {c.isPrivate ? (
              <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <span className="text-sm font-medium truncate">{c.name}</span>
            {c.numMembers != null && (
              <span className="text-[11px] text-muted-foreground shrink-0">
                {c.numMembers} {c.numMembers === 1 ? 'member' : 'members'}
              </span>
            )}
            <code className="ml-auto text-[10px] text-muted-foreground font-mono shrink-0">
              {c.id}
            </code>
          </li>
        ))}
      </ul>
    )
  },
}

export const slackGetChannelHistoryRenderer: ToolRenderer = {
  match: 'slack_get_channel_history',
  icon: MessageSquare,
  displayName: 'Slack History',
  summary: (output) => {
    const o = output as SlackGetChannelHistoryOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    const n = o.count
    return `${n} ${n === 1 ? 'message' : 'messages'}`
  },
  expanded: ({ output }) => {
    const o = output as SlackGetChannelHistoryOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <ul className="divide-y divide-border/60 -mx-2">
        {o.messages.map((m, idx) => (
          <li key={`${m.ts}-${idx}`} className="flex flex-col gap-0.5 px-2 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-foreground truncate">
                {m.userName ?? m.user ?? 'Unknown'}
              </span>
              <span className="text-muted-foreground ml-auto shrink-0">{tsToDate(m.ts)}</span>
            </div>
            <div className="text-sm whitespace-pre-wrap">{m.text}</div>
            {m.replyCount != null && m.replyCount > 0 && (
              <div className="text-[11px] text-muted-foreground">
                {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  },
}

export const slackGetUserRenderer: ToolRenderer = {
  match: 'slack_get_user',
  icon: User,
  displayName: 'Slack User',
  summary: (output) => {
    const o = output as SlackGetUserOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return o.realName ?? o.name ?? o.id
  },
  expanded: ({ output }) => {
    const o = output as SlackGetUserOutput | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{o.realName ?? o.name ?? '—'}</dd>
        {o.title && (
          <>
            <dt className="text-muted-foreground">Title</dt>
            <dd>{o.title}</dd>
          </>
        )}
        {o.email && (
          <>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-mono">{o.email}</dd>
          </>
        )}
        {o.timezone && (
          <>
            <dt className="text-muted-foreground">Timezone</dt>
            <dd>{o.timezone}</dd>
          </>
        )}
      </dl>
    )
  },
}

export const slackPostMessageRenderer: ToolRenderer = {
  match: 'slack_post_message',
  icon: Send,
  displayName: 'Slack Post',
  summary: (output) => {
    const o = output as SlackPostMessageOutput | undefined
    if (!o) return null
    if ('error' in o) return 'failed'
    return 'posted'
  },
  expanded: ({ output, input }) => {
    const o = output as SlackPostMessageOutput | undefined
    const i = input as { channelId?: string; text?: string } | undefined
    if (!o) return null
    if ('error' in o) {
      return (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs p-3">{o.error}</div>
      )
    }
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
          Posted to <code className="font-mono">{o.channel}</code>
        </div>
        {i?.text && (
          <div className="rounded-md border bg-muted/30 p-2 text-sm whitespace-pre-wrap">
            {i.text}
          </div>
        )}
        {o.permalink && (
          <a
            href={o.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted-foreground hover:text-foreground underline"
          >
            Open in Slack
          </a>
        )}
      </div>
    )
  },
}
