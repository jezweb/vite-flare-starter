/**
 * ChatMessage Component
 *
 * Displays a single chat message with markdown rendering for assistant responses.
 * Supports AI SDK v6 UIMessage format with parts-based content.
 */
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bot, User } from 'lucide-react'
import type { Message } from '../hooks/useChat'

interface ChatMessageProps {
  message: Message
}

/**
 * Extract text content from AI SDK UIMessage parts
 */
function getMessageText(message: Message): string {
  if (!message.parts || message.parts.length === 0) {
    return ''
  }
  return message.parts
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const content = getMessageText(message)

  return (
    <div
      className={cn(
        'flex gap-3 p-4',
        isUser && 'flex-row-reverse'
      )}
    >
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className={cn(
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}>
          {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          'flex-1 space-y-2 overflow-hidden',
          isUser && 'text-right'
        )}
      >
        <div
          className={cn(
            'inline-block rounded-lg px-4 py-2 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'
          )}
        >
          {isAssistant ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: ({ children }) => (
                    <pre className="overflow-x-auto rounded-md bg-background/50 p-3 text-xs">
                      {children}
                    </pre>
                  ),
                  code: ({ className, children, ...props }) => {
                    const isInline = !className
                    return isInline ? (
                      <code
                        className="rounded bg-background/50 px-1 py-0.5 text-xs font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    ) : (
                      <code className={cn('font-mono text-xs', className)} {...props}>
                        {children}
                      </code>
                    )
                  },
                  a: ({ children, ...props }) => (
                    <a
                      className="text-primary underline hover:text-primary/80"
                      target="_blank"
                      rel="noopener noreferrer"
                      {...props}
                    >
                      {children}
                    </a>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-4 space-y-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-4 space-y-1">{children}</ol>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse border border-border text-xs">
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-border bg-muted px-2 py-1 text-left font-medium">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-border px-2 py-1">{children}</td>
                  ),
                }}
              >
                {content || '...'}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{content}</p>
          )}
        </div>
      </div>
    </div>
  )
})

export default ChatMessage
