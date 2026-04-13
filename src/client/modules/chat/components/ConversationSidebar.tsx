/**
 * ConversationSidebar — list of past conversations with CRUD
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
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

export function ConversationSidebar({ activeConversationId }: Props) {
  const navigate = useNavigate()
  const { data, isLoading } = useConversationList()
  const deleteConversation = useDeleteConversation()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const conversations = data?.conversations ?? []

  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/30">
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

      <ScrollArea className="flex-1">
        {isLoading ? (
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
          <div className="p-1.5 space-y-0.5">
            {conversations.map((conv) => (
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
        )}
      </ScrollArea>
    </div>
  )
}
