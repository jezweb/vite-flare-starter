/**
 * ChatPage
 *
 * Full-page AI chat interface with model selection, streaming responses,
 * tool calling, and message metadata display.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Trash2, MessageSquare } from 'lucide-react'
import { ChatMessage, ChatInput, ModelSelector } from '../components'
import { useChat } from '../hooks/useChat'
import { DEFAULT_MODEL, MODEL_REGISTRY } from '@/server/lib/ai/models'

export function ChatPage() {
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const modelConfig = MODEL_REGISTRY[model as keyof typeof MODEL_REGISTRY]
  const scrollRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    isLoading,
    error,
    sendMessage,
    stop,
    clearMessages,
    setMessages,
  } = useChat({ model })

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (text: string, files?: File[]) => {
    if (files && files.length > 0) {
      // Convert files to data URLs for AI SDK
      const filePromises = files.map(async (file) => {
        const buffer = await file.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
        const dataUrl = `data:${file.type};base64,${base64}`
        return { type: 'file' as const, mediaType: file.type, url: dataUrl, filename: file.name }
      })
      const fileParts = await Promise.all(filePromises)
      sendMessage({ text, files: fileParts })
    } else {
      sendMessage({ text })
    }
  }

  // Regenerate: remove the last assistant message and re-send the last user message
  const handleRegenerate = useCallback(() => {
    if (isLoading || messages.length < 2) return
    const lastAssistantIdx = [...messages].reverse().findIndex(m => m.role === 'assistant')
    if (lastAssistantIdx === -1) return
    const removeFrom = messages.length - 1 - lastAssistantIdx
    const remaining = messages.slice(0, removeFrom)
    const lastUserMsg = [...remaining].reverse().find(m => m.role === 'user')
    if (!lastUserMsg) return
    const userText = lastUserMsg.parts
      ?.filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
      .map(p => p.text)
      .join('') || ''
    if (!userText) return
    setMessages(remaining)
    // Small delay to let state settle before re-sending
    setTimeout(() => sendMessage({ text: userText }), 50)
  }, [messages, isLoading, setMessages, sendMessage])

  // Find the last assistant message index for regenerate button
  const lastAssistantIdx = [...messages].reverse().findIndex(m => m.role === 'assistant')
  const lastAssistantMsgIdx = lastAssistantIdx === -1 ? -1 : messages.length - 1 - lastAssistantIdx

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
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
            {messages.map((message, idx) => (
              <ChatMessage
                key={message.id}
                message={message}
                isLast={idx === lastAssistantMsgIdx && !isLoading}
                onRegenerate={handleRegenerate}
              />
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
        onSend={handleSend}
        onStop={stop}
        isLoading={isLoading}
        placeholder="Send a message..."
        supportsVision={modelConfig?.supportsVision ?? false}
      />
    </div>
  )
}

export default ChatPage
