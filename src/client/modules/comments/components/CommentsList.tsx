/**
 * CommentsList — renders threaded comments for any entity
 *
 * @example
 * <CommentsList entityType="issue" entityId="abc-123" />
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageSquare, Reply, Trash2, Pencil } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Comment {
  id: string
  entityType: string
  entityId: string
  userId: string
  body: string
  parentId: string | null
  createdAt: string
  updatedAt: string
}

interface Props {
  entityType: string
  entityId: string
  currentUserId?: string
}

export function CommentsList({ entityType, entityId, currentUserId }: Props) {
  const queryClient = useQueryClient()
  const [newComment, setNewComment] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['comments', entityType, entityId],
    queryFn: () => apiClient.get<{ comments: Comment[] }>(`/api/comments?entityType=${entityType}&entityId=${entityId}`),
  })

  const createComment = useMutation({
    mutationFn: (body: { body: string; parentId?: string }) =>
      apiClient.post('/api/comments', { entityType, entityId, ...body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', entityType, entityId] })
      setNewComment('')
      setReplyTo(null)
    },
  })

  const updateComment = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      apiClient.patch(`/api/comments/${id}`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', entityType, entityId] })
      setEditingId(null)
    },
  })

  const deleteComment = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/comments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', entityType, entityId] })
    },
  })

  const allComments = data?.comments ?? []
  const topLevel = allComments.filter((c) => !c.parentId)
  const replies = (parentId: string) => allComments.filter((c) => c.parentId === parentId)

  const renderComment = (comment: Comment, depth: number = 0) => (
    <div key={comment.id} className={depth > 0 ? 'ml-8 border-l-2 border-muted pl-4' : ''}>
      <div className="flex gap-3 py-3">
        <Avatar className="size-7 shrink-0">
          <AvatarFallback className="text-xs">
            {comment.userId.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{comment.userId.slice(0, 8)}</span>
            <span>{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
            {comment.updatedAt !== comment.createdAt && <span>(edited)</span>}
          </div>
          {editingId === comment.id ? (
            <div className="mt-1 space-y-2">
              <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => updateComment.mutate({ id: comment.id, body: editBody })}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm whitespace-pre-wrap">{comment.body}</p>
          )}
          <div className="mt-1 flex gap-2">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => setReplyTo(comment.id)}>
              <Reply className="size-3" /> Reply
            </Button>
            {currentUserId === comment.userId && (
              <>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => { setEditingId(comment.id); setEditBody(comment.body) }}>
                  <Pencil className="size-3" /> Edit
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-destructive" onClick={() => deleteComment.mutate(comment.id)}>
                  <Trash2 className="size-3" /> Delete
                </Button>
              </>
            )}
          </div>
          {/* Reply input */}
          {replyTo === comment.id && (
            <div className="mt-2 space-y-2">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a reply..."
                rows={2}
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => createComment.mutate({ body: newComment, parentId: comment.id })} disabled={!newComment.trim()}>
                  Reply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setReplyTo(null); setNewComment('') }}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Nested replies */}
      {replies(comment.id).map((reply) => renderComment(reply, depth + 1))}
    </div>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="size-4" />
        {allComments.length} comment{allComments.length !== 1 ? 's' : ''}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-16 rounded bg-muted animate-pulse" />)}
        </div>
      ) : (
        <>
          {topLevel.map((c) => renderComment(c))}

          {/* New comment input (top-level) */}
          {!replyTo && (
            <div className="pt-2 space-y-2 border-t">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                rows={2}
              />
              <Button size="sm" onClick={() => createComment.mutate({ body: newComment })} disabled={!newComment.trim()}>
                Comment
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
