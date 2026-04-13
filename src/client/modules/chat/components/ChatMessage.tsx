/**
 * ChatMessage Component
 *
 * Displays a single chat message with markdown rendering for assistant responses.
 * Supports AI SDK v6 UIMessage parts: text, reasoning, tool invocations.
 */
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bot, User, Brain, Wrench, Loader2 } from 'lucide-react'
import type { Message } from '../hooks/useChat'

interface ChatMessageProps {
  message: Message
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  return (
    <div className={cn('flex gap-3 p-4', isUser && 'flex-row-reverse')}>
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className={cn(
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}>
          {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
        </AvatarFallback>
      </Avatar>

      <div className={cn('flex-1 space-y-2 overflow-hidden', isUser && 'text-right')}>
        <div className={cn(
          'inline-block rounded-lg px-4 py-2 text-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        )}>
          {isAssistant ? (
            <div className="space-y-2">
              {message.parts?.map((part, i) => {
                // Reasoning parts (from extractReasoningMiddleware)
                if (part.type === 'reasoning') {
                  return (
                    <details key={i} className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer flex items-center gap-1">
                        <Brain className="size-3" />
                        Reasoning
                      </summary>
                      <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] opacity-70">
                        {part.text}
                      </pre>
                    </details>
                  )
                }

                // Tool parts (type is 'tool-{name}' or 'dynamic-tool')
                if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
                  const p = part as Record<string, unknown>
                  const toolName = String(p['toolName'] || part.type.replace('tool-', ''))
                  const state = String(p['state'] || 'pending')
                  const output = p['output']
                  const isComplete = state === 'result' || state === 'call' || output != null
                  return (
                    <div key={i} className="my-1 rounded border border-border/50 bg-background/30 px-3 py-2 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        {isComplete ? (
                          <Wrench className="size-3" />
                        ) : (
                          <Loader2 className="size-3 animate-spin" />
                        )}
                        <span className="font-medium">{toolName}</span>
                      </div>
                      {isComplete && output != null && (
                        <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto">
                          {JSON.stringify(output, null, 2)}
                        </pre>
                      )}
                    </div>
                  )
                }

                // Text parts
                if (part.type === 'text') {
                  return (
                    <div key={i} className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {part.text || '...'}
                      </ReactMarkdown>
                    </div>
                  )
                }

                return null
              })}
              {(!message.parts || message.parts.length === 0) && (
                <span className="text-muted-foreground">...</span>
              )}
            </div>
          ) : (
            <p className="whitespace-pre-wrap">
              {message.parts
                ?.filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
                .map((p) => p.text)
                .join('') || ''}
            </p>
          )}
        </div>
      </div>
    </div>
  )
})

export default ChatMessage
