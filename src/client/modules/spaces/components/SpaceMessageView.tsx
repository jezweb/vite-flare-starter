/**
 * SpaceMessageView — render a single message in the timeline.
 *
 * Knows about:
 *   - Mention pills inline in text parts
 *   - Bot vs user identity (bot badge, agent name)
 *   - Thread count indicator + "Reply in thread" link
 *   - Pinned-at indicator (Phase 2 polish)
 */
import { Bot, MessageSquare, User } from 'lucide-react'
import { MentionPill } from './MentionPill'
import { MessageReactions } from './MessageReactions'
import { useSession } from '@/client/lib/auth'
import { cn } from '@/lib/utils'
import type { SpaceMessage, SpaceUserInfo } from '../hooks/useSpaces'

interface PartLike {
  type?: string
  text?: string
  data?: { handle?: string; userId?: string; agentName?: string }
}

interface Props {
  message: SpaceMessage
  users: SpaceUserInfo[]
  onOpenThread?: (messageId: string) => void
}

export function SpaceMessageView({ message, users, onOpenThread }: Props) {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id
  const meta = message.metadata ?? {}
  const senderKind = meta.senderKind ?? (message.role === 'assistant' ? 'agent' : 'user')
  const senderUser = meta.senderUserId ? users.find((u) => u.id === meta.senderUserId) : null
  const senderLabel =
    senderKind === 'agent'
      ? `@${meta.senderAgentName ?? 'agent'}`
      : senderUser?.name ?? 'Member'
  const isBot = senderKind === 'agent'

  const parts = Array.isArray(message.parts) ? (message.parts as PartLike[]) : []

  return (
    <div className="group flex gap-3 rounded-md px-3 py-2 hover:bg-accent/30">
      <div
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          isBot ? 'bg-emerald-500/15' : 'bg-muted',
        )}
      >
        {isBot ? (
          <Bot className="size-4 text-emerald-700 dark:text-emerald-300" />
        ) : senderUser?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={senderUser.image}
            alt={senderUser.name}
            className="size-full rounded-full object-cover"
          />
        ) : (
          <User className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">{senderLabel}</span>
          {isBot && (
            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              Bot
            </span>
          )}
          <span className="text-muted-foreground">{relTime(message.createdAt)}</span>
        </div>
        <div className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
          {renderParts(parts)}
        </div>
        <MessageReactions
          messageId={message.id}
          reactions={message.reactions}
          currentUserId={currentUserId}
        />
        {message.threadCount > 0 && onOpenThread && (
          <button
            type="button"
            onClick={() => onOpenThread(message.id)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <MessageSquare className="size-3" />
            {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>
      {/* Hover action bar — quick emojis + thread shortcut. Hidden until hover. */}
      <div className="ml-auto flex shrink-0 items-start opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 shadow-sm">
          <MessageReactions messageId={message.id} reactions={message.reactions} currentUserId={currentUserId} quickBar />
          {onOpenThread && (
            <button
              type="button"
              onClick={() => onOpenThread(message.id)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Reply in thread"
              title="Reply in thread"
            >
              <MessageSquare className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function renderParts(parts: PartLike[]) {
  return parts.flatMap((part, i) => {
    if (part.type === 'mention') {
      const handle = part.data?.handle ?? part.data?.agentName ?? part.data?.userId ?? 'mention'
      const kind: 'user' | 'agent' = part.data?.agentName ? 'agent' : 'user'
      const label = kind === 'agent' ? `@${handle}` : handle
      return [<MentionPill key={`p-${i}`} kind={kind} label={label} className="mx-0.5" />]
    }
    if (part.type === 'text' && typeof part.text === 'string') {
      return [<span key={`p-${i}`}>{part.text}</span>]
    }
    return []
  })
}

function relTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return new Date(iso).toLocaleString()
}
