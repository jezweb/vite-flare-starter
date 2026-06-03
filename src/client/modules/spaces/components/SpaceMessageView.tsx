/**
 * SpaceMessageView — render a single message in the timeline.
 *
 * Knows about:
 *   - Mention pills inline in text parts
 *   - Bot vs user identity (bot badge, agent name)
 *   - Thread count indicator + "Reply in thread" link
 *   - Pinned-at indicator (Phase 2 polish)
 */
import { Bot, MessageSquare, Pin, Quote as QuoteIcon, Star, User } from 'lucide-react'
import { MentionPill } from './MentionPill'
import { MessageReactions } from './MessageReactions'
import { MessageMoreMenu } from './MessageMoreMenu'
import { useSession } from '@/client/lib/auth'
import { cn } from '@/lib/utils'
import { formatRelative as formatRelativeShared } from '@/client/lib/format-time'
import type { SpaceMessage, SpaceUserInfo } from '../hooks/useSpaces'

interface PartLike {
  type?: string
  text?: string
  data?: { handle?: string; userId?: string; agentName?: string }
}

interface Props {
  message: SpaceMessage
  users: SpaceUserInfo[]
  /** Caller hands us all messages so quoted previews resolve client-side. */
  allMessages?: SpaceMessage[]
  onOpenThread?: (messageId: string) => void
  onQuote?: (msg: SpaceMessage) => void
  /** True when the requesting user is owner/admin (controls pin enable). */
  canPin?: boolean
}

export function SpaceMessageView({
  message,
  users,
  allMessages,
  onOpenThread,
  onQuote,
  canPin,
}: Props) {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id
  const meta = message.metadata ?? {}
  const senderKind = meta.senderKind ?? (message.role === 'assistant' ? 'agent' : 'user')
  const senderUser = meta.senderUserId ? users.find((u) => u.id === meta.senderUserId) : null
  const stars: string[] = Array.isArray(
    (message as unknown as { starredByUserIds?: string[] }).starredByUserIds
  )
    ? (message as unknown as { starredByUserIds: string[] }).starredByUserIds
    : []
  const isStarred = currentUserId ? stars.includes(currentUserId) : false
  const isPinned = !!message.pinnedAt
  const quotedId =
    (message as unknown as { quotedMessageId?: string | null }).quotedMessageId ?? null
  const quotedSource =
    quotedId && allMessages ? (allMessages.find((m) => m.id === quotedId) ?? null) : null
  const senderLabel =
    senderKind === 'agent' ? `@${meta.senderAgentName ?? 'agent'}` : (senderUser?.name ?? 'Member')
  const isBot = senderKind === 'agent'

  const parts = Array.isArray(message.parts) ? (message.parts as PartLike[]) : []

  return (
    <div className="group relative flex gap-3 rounded-md px-3 py-2 hover:bg-accent/30">
      <div
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          isBot ? 'bg-emerald-500/15' : 'bg-muted'
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
          {isStarred && <Star className="size-3 text-amber-500" aria-label="Starred" />}
          {isPinned && <Pin className="size-3 text-amber-500" aria-label="Pinned to space" />}
        </div>
        {quotedSource ? (
          <div className="mt-1 rounded-md border-l-2 border-muted-foreground/40 bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
            <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider">
              <QuoteIcon className="size-2.5" />
              Quote
            </div>
            <div className="line-clamp-3 whitespace-pre-wrap break-words">
              {renderParts(
                Array.isArray(quotedSource.parts) ? (quotedSource.parts as PartLike[]) : []
              )}
            </div>
          </div>
        ) : null}
        {(meta as { cardFormat?: SpaceMessageCard }).cardFormat ? (
          <CardMessage card={(meta as { cardFormat: SpaceMessageCard }).cardFormat} />
        ) : (
          <div className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {renderParts(parts)}
          </div>
        )}
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
      {/* Hover action bar — absolute-positioned overlay so it never
          consumes row-flex space (was causing the content `min-w-0`
          flex child to compute width=0 at narrow viewports). */}
      <div className="absolute right-2 top-1 flex items-start opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 shadow-sm">
          <MessageReactions
            messageId={message.id}
            reactions={message.reactions}
            currentUserId={currentUserId}
            quickBar
          />
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
          <MessageMoreMenu message={message} onQuote={onQuote} canPin={!!canPin} />
        </div>
      </div>
    </div>
  )
}

/**
 * Bot card-format payload. Agents producing daily digests / reports
 * emit this shape on metadata.cardFormat so the UI renders a
 * structured card instead of a plain text message.
 */
export interface SpaceMessageCard {
  title?: string
  subtitle?: string
  body?: string
  fields?: Array<{ label: string; value: string }>
  /** Optional tone — default 'neutral'. Affects accent border colour. */
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}

function CardMessage({ card }: { card: SpaceMessageCard }) {
  const tone = card.tone ?? 'neutral'
  const toneClass = {
    neutral: 'border-border bg-card',
    success: 'border-emerald-500/40 bg-emerald-500/5',
    warning: 'border-amber-500/40 bg-amber-500/5',
    danger: 'border-destructive/40 bg-destructive/5',
    info: 'border-sky-500/40 bg-sky-500/5',
  }[tone]
  return (
    <div className={`mt-1 rounded-md border-l-4 px-3 py-2 ${toneClass}`}>
      {card.title && <div className="text-sm font-semibold">{card.title}</div>}
      {card.subtitle && <div className="text-xs text-muted-foreground">{card.subtitle}</div>}
      {card.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{card.body}</p>}
      {card.fields && card.fields.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {card.fields.map((f, i) => (
            <div key={i} className="contents">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
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
  return formatRelativeShared(iso)
}
