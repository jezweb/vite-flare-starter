/**
 * ChatPage
 *
 * Full-page AI chat interface with model selection and streaming responses
 */
import { useState, useRef, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Trash2, MessageSquare } from 'lucide-react'
import { ChatMessage, ChatInput, ModelSelector } from '../components'
import { useChat } from '../hooks/useChat'

export function ChatPage() {
  const [model, setModel] = useState<string>('@cf/meta/llama-3.1-8b-instruct')
  const scrollRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
  } = useChat({ model })

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <MessageSquare className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">AI Chat</h1>
        </div>
        <div className="flex items-center gap-2">
          <ModelSelector
            value={model}
            onChange={setModel}
            disabled={isLoading}
          />
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearMessages}
              disabled={isLoading}
              title="Clear chat"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-center max-w-md">
              <MessageSquare className="mx-auto size-12 text-muted-foreground/50 mb-4" />
              <h2 className="text-lg font-medium mb-2">Start a conversation</h2>
              <p className="text-sm text-muted-foreground">
                Send a message to begin chatting with the AI. Responses support markdown
                formatting including code blocks, lists, and tables.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Error display */}
      {error && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        onStop={stopGeneration}
        isLoading={isLoading}
        placeholder="Send a message..."
      />
    </div>
  )
}

export default ChatPage
