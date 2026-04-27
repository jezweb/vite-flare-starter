/**
 * SpacePage — `/dashboard/spaces/:id`
 *
 * Three-pane on desktop (members · timeline · thread when open),
 * collapsing to a single column on mobile.
 *
 * Phase 1: full timeline, @-autocomplete, threads (right pane), live
 * presence + new-message broadcast via WebSocket.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Loader2, ChevronLeft, X, Hash, MessageSquare, Search } from 'lucide-react'
import { useSpace, useSendSpaceMessage, useSpaceMessages, useMarkSpaceRead } from '../hooks/useSpaces'
import { useSpaceWebSocket } from '../hooks/useSpaceWebSocket'
import { MemberList } from '../components/MemberList'
import { MessageInput } from '../components/MessageInput'
import { SpaceMessageView } from '../components/SpaceMessageView'
import { SpaceHeaderMenu } from '../components/SpaceHeaderMenu'
import { SearchInSpacePane } from '../components/SearchInSpacePane'

export function SpacePage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, error } = useSpace(id)
  const send = useSendSpaceMessage(id)
  const markRead = useMarkSpaceRead(id)
  const { online, connected } = useSpaceWebSocket(id)
  const [threadParentId, setThreadParentId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const messageScrollRef = useRef<HTMLDivElement | null>(null)

  // Always read the latest top-level messages from the cache. The
  // detail call seeds the cache on first load; the WS pushes new
  // entries.
  const topMessagesQuery = useSpaceMessages(id, { threadParentId: null })
  const threadQuery = useSpaceMessages(threadParentId ? id : undefined, { threadParentId })
  const messages = topMessagesQuery.data?.messages ?? data?.messages ?? []
  const threadMessages = threadQuery.data?.messages ?? []

  // Mark the space as read on mount.
  useEffect(() => {
    if (id) markRead.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Scroll-to-bottom when new messages arrive.
  useEffect(() => {
    const el = messageScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length])

  const threadParent = useMemo(
    () => (threadParentId ? messages.find((m) => m.id === threadParentId) ?? null : null),
    [threadParentId, messages],
  )

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="container mx-auto py-12 text-sm text-muted-foreground">
        <p>Space not found, or you don&apos;t have access.</p>
        <Link to="/dashboard/spaces" className="mt-2 inline-flex items-center gap-1 text-primary hover:underline">
          <ChevronLeft className="size-3.5" />
          Back to spaces
        </Link>
      </div>
    )
  }

  const { space, members, users } = data

  return (
    <div className="flex h-[calc(100vh-3.75rem)] flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-2.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/dashboard/spaces"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Back to spaces"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Hash className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{space.title || 'Untitled space'}</h1>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{members.length} members</span>
              <span>•</span>
              <span className={connected ? 'text-emerald-600' : 'text-muted-foreground'}>
                {connected ? 'Live' : 'Connecting…'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen((s) => !s)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Search in space"
          >
            <Search className="size-4" />
          </button>
          <SpaceHeaderMenu space={space} />
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left rail — members */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-background/60 p-3 md:block">
          <MemberList members={members} users={users} online={online} />
        </aside>

        {/* Center — main timeline */}
        <main className="flex flex-1 min-w-0 flex-col">
          <div ref={messageScrollRef} className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <Hash className="size-6 text-muted-foreground/40" />
                <div>
                  <div className="font-medium text-foreground">Welcome to {space.title}</div>
                  <p className="mt-1 max-w-md">
                    Say hi, drop a topic, or @-mention an agent to get started.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {messages.map((m) => (
                  <SpaceMessageView
                    key={m.id}
                    message={m}
                    users={users}
                    onOpenThread={(mid) => setThreadParentId(mid)}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-border bg-background/80 p-3 backdrop-blur">
            <MessageInput
              members={members}
              users={users}
              busy={send.isPending}
              onSend={async (parts) => {
                await send.mutateAsync({ parts })
              }}
            />
          </div>
        </main>

        {/* Right pane — search OR thread, mutually exclusive */}
        {searchOpen && id ? (
          <SearchInSpacePane spaceId={id} users={users} open={searchOpen} onClose={() => setSearchOpen(false)} />
        ) : threadParentId && threadParent ? (
          <aside className="hidden w-96 shrink-0 flex-col border-l border-border bg-background/60 lg:flex">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="size-3.5 text-muted-foreground" />
                <span className="font-medium">Thread</span>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent"
                onClick={() => setThreadParentId(null)}
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <SpaceMessageView message={threadParent} users={users} />
              <div className="my-2 border-t border-border" />
              {threadMessages.length === 0 ? (
                <p className="px-3 text-xs text-muted-foreground">No replies yet.</p>
              ) : (
                <div className="space-y-1">
                  {threadMessages.map((m) => (
                    <SpaceMessageView key={m.id} message={m} users={users} />
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-border bg-background/80 p-3">
              <MessageInput
                members={members}
                users={users}
                threadParentId={threadParentId}
                busy={send.isPending}
                placeholder="Reply in thread…"
                onSend={async (parts) => {
                  await send.mutateAsync({ parts, parentMessageId: threadParentId })
                }}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
