/**
 * ChatPage — full-page AI chat interface built on AI Elements.
 *
 * Uses AI Elements primitives (Conversation, Message, PromptInput) for
 * polished chat UI with streaming, tool calls, reasoning, and file
 * attachments. Custom bits (artifacts, documents, inline UI, input
 * takeover, approval UI) are composed inside the AI Elements layout.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
} from '@/components/ai-elements/prompt-input'
import { Suggestion } from '@/components/ai-elements/suggestion'
import { Plus, MessageSquare, PanelLeft, PanelLeftClose, Sparkles, Download } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useMediaQuery } from '@/client/hooks/useMediaQuery'
import { useChat, type Message } from '../hooks/useChat'
import { useConversationMessages } from '../hooks/useConversations'
import { ConversationSidebar } from '../components/ConversationSidebar'
import { MessageRenderer } from '../components/MessageRenderer'
import { ModelSelector } from '../components'
import { DEFAULT_MODEL_ID } from '@/shared/config/models'
import { InputTakeover, isTakeoverElement } from '../components/chat-ui/InputTakeover'
import { hasUiMarker } from '../components/chat-ui/ChatUiElement'
import { AudioRecorder } from '@/client/components/AudioRecorder'
import { usePasteUpload } from '@/client/hooks/usePasteUpload'
import { useSession } from '@/client/lib/auth'

const EXAMPLE_PROMPTS = [
  'Search the web for the latest news on AI agents',
  'Remember that my preferred language is TypeScript',
  'Show me a table comparing the top 5 programming languages',
  'Help me draft an email about a project update',
]

export function ChatPage() {
  const { conversationId: urlConversationId } = useParams<{ conversationId?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID)
  const [showSidebar, setShowSidebar] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Share Target: when shared from mobile, params arrive as ?title=&text=&url=
  const sharedText = searchParams.get('text') || searchParams.get('title') || searchParams.get('url')
  // Vision support check — accept image attachments for models known to support it.
  // The API endpoint also validates this server-side.
  const supportsVision = model.includes('gemma') || model.includes('gemini') || model.includes('claude') || model.includes('gpt')

  const { data: existingConversation } = useConversationMessages(urlConversationId)

  const {
    messages,
    isLoading,
    error,
    status,
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
      // Refresh sidebar so the new conversation appears
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }
  }, [conversationId, urlConversationId, messages.length, navigate, queryClient])

  // Hydrate messages when the conversation loads (useChat ignores initialMessages after mount).
  // Messages from the API have createdAt as ISO string (JSON serialisation); convert back to Date
  // so the AI SDK's internal comparison/cloning works correctly.
  useEffect(() => {
    const raw = existingConversation?.messages as Message[] | undefined
    if (!raw || raw.length === 0 || messages.length > 0) return
    const hydrated = raw.map((m) => {
      const msg = m as Message & { createdAt?: unknown }
      return {
        ...m,
        parts: Array.isArray(m.parts) ? m.parts : [],
        ...(msg.createdAt != null
          ? { createdAt: msg.createdAt instanceof Date ? msg.createdAt : new Date(msg.createdAt as string) }
          : {}),
      }
    })
    setMessages(hydrated as Message[])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingConversation?.messages])

  // Share Target: auto-send shared text on first load, then clear params
  useEffect(() => {
    if (sharedText && messages.length === 0 && !isLoading) {
      sendMessage({ text: sharedText })
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedText])

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

  // Edit a user message: truncate to that point and re-send with new text
  const handleEdit = useCallback(
    (messageId: string, newText: string) => {
      if (isLoading) return
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return
      // Keep everything before this message
      const truncated = messages.slice(0, idx)
      setMessages(truncated)
      setTimeout(() => sendMessage({ text: newText }), 50)
    },
    [messages, isLoading, setMessages, sendMessage],
  )

  // Find the last assistant message index
  const lastAssistantIdx = useMemo(() => {
    const idx = [...messages].reverse().findIndex((m) => m.role === 'assistant')
    return idx === -1 ? -1 : messages.length - 1 - idx
  }, [messages])

  // ─── Input Takeover Detection ─────────────────────────────────
  const [activeTakeover, setActiveTakeover] = useState<{ _ui: string; [key: string]: unknown } | null>(null)

  useEffect(() => {
    const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssistantMsg?.parts) {
      if (activeTakeover) setActiveTakeover(null)
      return
    }
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
  }, [messages, isLoading, activeTakeover])

  useEffect(() => {
    if (messages.length === 0) setActiveTakeover(null)
  }, [messages.length])

  const handleTakeoverSubmit = useCallback(
    (text: string) => {
      setActiveTakeover(null)
      sendMessage({ text })
    },
    [sendMessage],
  )

  const handleTakeoverDismiss = useCallback(() => {
    setActiveTakeover(null)
  }, [])

  const handleToolApproval = useCallback(
    ({ toolCallId, result }: { toolCallId: string; toolName: string; result: 'approve' | 'deny' }) => {
      addToolApprovalResponse({ id: toolCallId, approved: result === 'approve' })
    },
    [addToolApprovalResponse],
  )

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      sendMessage({ text: suggestion })
    },
    [sendMessage],
  )

  const handleSubmit = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (message: { text?: string; files?: any[] }) => {
      const text = message.text?.trim()
      if (!text && !message.files?.length) return
      if (message.files && message.files.length > 0) {
        sendMessage({ text: text || '', files: message.files })
      } else if (text) {
        sendMessage({ text })
      }
    },
    [sendMessage],
  )

  // Helper: convert File/Blob → data URL for AI SDK's FileUIPart
  const toDataUrl = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  }, [])

  // Paste-to-upload: Cmd+V anywhere in the chat sends images as attachments
  const handlePastedFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const parts = await Promise.all(
        files.map(async (f) => ({ type: 'file' as const, url: await toDataUrl(f), mediaType: f.type })),
      )
      sendMessage({ text: 'What do you see in this image?', files: parts })
    },
    [sendMessage, toDataUrl],
  )
  usePasteUpload({ onPaste: handlePastedFiles, accept: 'image/*', global: true, disabled: isLoading })

  // Audio recording: sends the recorded blob as an attachment
  const handleAudioRecording = useCallback(
    async (blob: Blob) => {
      const url = await toDataUrl(blob)
      sendMessage({ text: 'Transcribe this audio recording.', files: [{ type: 'file', url, mediaType: blob.type }] })
    },
    [sendMessage, toDataUrl],
  )

  const hasMessages = messages.length > 0

  return (
    <div className="flex h-[calc(100svh-7rem)] min-h-[500px] overflow-hidden">
      {/* Conversation sidebar: inline on desktop, Sheet on mobile */}
      {showSidebar && isDesktop && (
        <ConversationSidebar activeConversationId={urlConversationId} />
      )}
      {showSidebar && !isDesktop && (
        <Sheet open onOpenChange={(open) => { if (!open) setShowSidebar(false) }}>
          <SheetContent side="left" className="w-64 p-0">
            <ConversationSidebar activeConversationId={urlConversationId} />
          </SheetContent>
        </Sheet>
      )}

      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setShowSidebar(!showSidebar)}
              title={showSidebar ? 'Hide conversations' : 'Show conversations'}
            >
              {showSidebar ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
            </Button>
            <MessageSquare className="size-4 text-muted-foreground ml-1" />
            <h1 className="text-sm font-medium">AI Chat</h1>
          </div>
          <div className="flex items-center gap-1">
            {hasMessages && conversationId && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={() => window.open(`/api/conversations/${conversationId}/export?format=md`, '_blank')}
                title="Export as Markdown"
              >
                <Download className="size-3.5" />
              </Button>
            )}
            {hasMessages && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => {
                  clearMessages()
                  navigate('/dashboard/chat')
                }}
                disabled={isLoading}
              >
                <Plus className="size-3.5" />
                New chat
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        {hasMessages ? (
          <Conversation className="flex-1">
            <ConversationContent className="max-w-3xl mx-auto w-full px-4 py-6">
              {messages.map((message, idx) => (
                <MessageRenderer
                  key={message.id}
                  message={message}
                  isLast={idx === lastAssistantIdx && !isLoading}
                  isLoading={isLoading && idx === messages.length - 1}
                  onRegenerate={handleRegenerate}
                  onEdit={handleEdit}
                  onSendMessage={(text) => sendMessage({ text })}
                  onToolApproval={handleToolApproval}
                  userImage={session?.user?.image}
                />
              ))}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        ) : (
          <EmptyState onSuggestion={handleSuggestion} />
        )}

        {/* Error display */}
        {error && (
          <div className="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Input area */}
        <div className="border-t bg-background">
          <div className="mx-auto max-w-3xl p-3">
            {activeTakeover ? (
              <InputTakeover
                element={activeTakeover}
                onSubmit={handleTakeoverSubmit}
                onDismiss={handleTakeoverDismiss}
              />
            ) : (
              <PromptInput
                onSubmit={handleSubmit}
                accept={supportsVision ? 'image/*' : undefined}
                multiple
                maxFiles={5}
                maxFileSize={10 * 1024 * 1024}
              >
                <PromptInputTextarea
                  placeholder={hasMessages ? 'Reply to the AI...' : 'Ask anything...'}
                />
                <PromptInputFooter>
                  <PromptInputTools>
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>
                    <AudioRecorder compact onRecordingComplete={handleAudioRecording} />
                    <ModelSelector value={model} onChange={setModel} disabled={isLoading} />
                  </PromptInputTools>
                  <PromptInputSubmit status={status} onStop={stop} />
                </PromptInputFooter>
              </PromptInput>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-4">
      <div className="max-w-2xl w-full text-center space-y-6">
        <div className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 mb-2">
          <Sparkles className="size-5 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">What can I help with?</h2>
          <p className="text-sm text-muted-foreground">
            60+ tools including web search, file management, code execution, image and video processing.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <Suggestion key={prompt} suggestion={prompt} onClick={onSuggestion} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default ChatPage
