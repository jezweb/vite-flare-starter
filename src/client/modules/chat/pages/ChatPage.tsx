/**
 * ChatPage
 *
 * Full-page AI chat interface with model selection, streaming responses,
 * tool calling, inline UI, and input takeover (claude.ai-style).
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Trash2, MessageSquare, PanelLeftClose, PanelLeft } from 'lucide-react'
import { ChatMessage, ChatInput, ModelSelector } from '../components'
import { useChat, type Message } from '../hooks/useChat'
import { useConversationMessages } from '../hooks/useConversations'
import { ConversationSidebar } from '../components/ConversationSidebar'
import { DEFAULT_MODEL, MODEL_REGISTRY } from '@/server/lib/ai/models'
import { InputTakeover, isTakeoverElement } from '../components/chat-ui/InputTakeover'
import { hasUiMarker } from '../components/chat-ui/ChatUiElement'

export function ChatPage() {
  const { conversationId: urlConversationId } = useParams<{ conversationId?: string }>()
  const navigate = useNavigate()
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [showSidebar, setShowSidebar] = useState(true)
  const modelConfig = MODEL_REGISTRY[model as keyof typeof MODEL_REGISTRY]
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load existing conversation messages if URL has an ID
  const { data: existingConversation } = useConversationMessages(urlConversationId)

  const {
    messages,
    isLoading,
    error,
    conversationId,
    sendMessage,
    stop,
    clearMessages,
    setMessages,
    addToolApprovalResponse,
  } = useChat({
    model,
    conversationId: urlConversationId,
    initialMessages: existingConversation?.messages as Message[] | undefined,
  })

  // Navigate to conversation URL when a new conversation is created
  useEffect(() => {
    if (conversationId && !urlConversationId && messages.length > 0) {
      navigate(`/dashboard/chat/${conversationId}`, { replace: true })
    }
  }, [conversationId, urlConversationId, messages.length, navigate])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (text: string, files?: File[]) => {
    if (files && files.length > 0) {
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

  // Regenerate: remove last assistant message and re-send last user message
  const handleRegenerate = useCallback(() => {
    if (isLoading || messages.length < 2) return
    const lastAssistantIdx = [...messages].reverse().findIndex((m) => m.role === 'assistant')
    if (lastAssistantIdx === -1) return
    const removeFrom = messages.length - 1 - lastAssistantIdx
    const remaining = messages.slice(0, removeFrom)
    const lastUserMsg = [...remaining].reverse().find((m) => m.role === 'user')
    if (!lastUserMsg) return
    const userText = lastUserMsg.parts
      ?.filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
      .map((p) => p.text)
      .join('') || ''
    if (!userText) return
    setMessages(remaining)
    setTimeout(() => sendMessage({ text: userText }), 50)
  }, [messages, isLoading, setMessages, sendMessage])

  // Find the last assistant message index for regenerate button
  const lastAssistantIdx = [...messages].reverse().findIndex((m) => m.role === 'assistant')
  const lastAssistantMsgIdx = lastAssistantIdx === -1 ? -1 : messages.length - 1 - lastAssistantIdx

  // ─── Input Takeover Detection ──────────────────────────────────────
  // Watch the last assistant message for _ui tool outputs that should
  // take over the input area (ask_questions, offer_choices, etc.)
  const [activeTakeover, setActiveTakeover] = useState<{ _ui: string; [key: string]: unknown } | null>(null)
  const lastTakeoverCheckRef = useRef(0)

  // Detect takeover elements in the most recent assistant message
  useEffect(() => {
    if (messages.length <= lastTakeoverCheckRef.current && !isLoading) return
    lastTakeoverCheckRef.current = messages.length

    // Find the last assistant message
    const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssistantMsg?.parts) return

    // Check all tool parts for _ui takeover markers
    for (const part of lastAssistantMsg.parts) {
      if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
        const p = part as Record<string, unknown>
        const output = p['output']
        if (output && hasUiMarker(output) && isTakeoverElement(output)) {
          setActiveTakeover(output as { _ui: string; [key: string]: unknown })
          return
        }
      }
    }
  }, [messages, isLoading])

  // Clear takeover when conversation is cleared
  useEffect(() => {
    if (messages.length === 0) {
      setActiveTakeover(null)
      lastTakeoverCheckRef.current = 0
    }
  }, [messages.length])

  const handleTakeoverSubmit = useCallback((text: string) => {
    setActiveTakeover(null)
    sendMessage({ text })
  }, [sendMessage])

  const handleTakeoverDismiss = useCallback(() => {
    setActiveTakeover(null)
  }, [])

  const handleToolApproval = useCallback(({ toolCallId, result }: { toolCallId: string; toolName: string; result: 'approve' | 'deny' }) => {
    addToolApprovalResponse({ id: toolCallId, approved: result === 'approve' })
  }, [addToolApprovalResponse])

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Conversation Sidebar */}
      {showSidebar && (
        <ConversationSidebar activeConversationId={urlConversationId} />
      )}

      {/* Chat Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setShowSidebar(!showSidebar)}
              title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
            >
              {showSidebar ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
            </Button>
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
                onClick={() => {
                  clearMessages()
                  navigate('/dashboard/chat')
                }}
                disabled={isLoading}
                title="New chat"
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
                onSendMessage={(text) => sendMessage({ text })}
                onToolApproval={handleToolApproval}
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

      {/* Input area — either InputTakeover or ChatInput */}
      {activeTakeover ? (
        <InputTakeover
          element={activeTakeover}
          onSubmit={handleTakeoverSubmit}
          onDismiss={handleTakeoverDismiss}
        />
      ) : (
        <ChatInput
          onSend={handleSend}
          onStop={stop}
          isLoading={isLoading}
          placeholder="Send a message..."
          supportsVision={modelConfig?.supportsVision ?? false}
        />
      )}
      </div>{/* end chat area */}
    </div>
  )
}

export default ChatPage
