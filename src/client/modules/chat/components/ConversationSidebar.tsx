/**
 * ConversationSidebar — list of past conversations with search + CRUD
 */
import { useState, useDeferredValue } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, MessageSquare, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { apiClient } from '@/client/lib/api-client'
import { useConversationList, useDeleteConversation } from '../hooks/useConversations'

interface Props {
  activeConversationId?: string
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString()
}

interface ConversationSummary {
  id: string
  title: string | null
  model: string | null
  createdAt: string
  updatedAt: string
}

/** Group conversations into Today / Yesterday / Last 7 days / Older */
function groupByDate(conversations: ConversationSummary[]) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const weekStart = todayStart - 7 * 86400000

  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Last 7 days', items: [] },
    { label: 'Older', items: [] },
  ]

  for (const conv of conversations) {
    const ts = new Date(conv.updatedAt).getTime()
    if (ts >= todayStart) groups[0]!.items.push(conv)
    else if (ts >= yesterdayStart) groups[1]!.items.push(conv)
    else if (ts >= weekStart) groups[2]!.items.push(conv)
    else groups[3]!.items.push(conv)
  }

  return groups.filter((g) => g.items.length > 0)
}

export function ConversationSidebar({ activeConversationId }: Props) {
  const navigate = useNavigate()
  const { data, isLoading } = useConversationList()
  const deleteConversation = useDeleteConversation()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredQuery = useDeferredValue(searchQuery)

  const conversations = data?.conversations ?? []

  // Search conversations when query is non-empty
  const { data: searchResults } = useQuery({
    queryKey: ['conversations', 'search', deferredQuery],
    queryFn: () =>
      apiClient.get<{ results: { conversationId: string; snippet: string; role: string }[] }>(
        `/api/conversations/search?q=${encodeURIComponent(deferredQuery)}`,
      ),
    enabled: deferredQuery.length >= 2,
  })

  const isSearching = deferredQuery.length >= 2
  const searchHits = searchResults?.results ?? []

  return (
    <div className="flex h-full w-56 flex-col border-r bg-muted/30 shrink-0">
      <div className="flex items-center justify-between p-3 border-b">
        <span className="text-sm font-medium">Conversations</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => navigate('/dashboard/chat')}
          title="New conversation"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="px-2 pt-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isSearching ? (
          // Search results
          searchHits.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No results for "{deferredQuery}"
            </div>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {searchHits.map((hit) => (
                <div
                  key={hit.conversationId}
                  className="rounded-md px-2.5 py-2 cursor-pointer transition-colors hover:bg-muted"
                  onClick={() => navigate(`/dashboard/chat/${hit.conversationId}`)}
                >
                  <div className="text-sm truncate">{hit.snippet}</div>
                  <div className="text-[10px] text-muted-foreground">{hit.role === 'title' ? 'Title match' : 'Message match'}</div>
                </div>
              ))}
            </div>
          )
        ) : isLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          <div className="p-1.5 space-y-2">
            {groupByDate(conversations).map((group) => (
              <div key={group.label}>
                <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        'group flex items-center gap-2 rounded-md px-2.5 py-2 cursor-pointer transition-colors',
                        conv.id === activeConversationId
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-muted'
                      )}
                      onClick={() => navigate(`/dashboard/chat/${conv.id}`)}
                      onMouseEnter={() => setHoveredId(conv.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">
                          {conv.title || 'Untitled'}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {timeAgo(conv.updatedAt)}
                        </div>
                      </div>
                      {hoveredId === conv.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteConversation.mutate(conv.id)
                            if (conv.id === activeConversationId) {
                              navigate('/dashboard/chat')
                            }
                          }}
                          title="Delete conversation"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
