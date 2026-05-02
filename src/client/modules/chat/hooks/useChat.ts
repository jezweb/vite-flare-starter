/**
 * useChat Hook
 *
 * Wraps AI SDK's useChat for streaming chat with Workers AI.
 * Features: conversation persistence, bandwidth-optimised transport,
 * client-side tool execution, typed metadata, tool approval flow.
 */
import { useChat as useAIChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from 'ai'
import { useMemo, useRef, useEffect } from 'react'
import { messageMetadataSchema, type MessageMetadata } from '@/shared/schemas/chat.schema'

export type Message = UIMessage
export type { MessageMetadata }

interface ChatOptions {
  model?: string
  systemPrompt?: string
  conversationId?: string
  /**
   * When starting a new conversation from a project page ("New chat in
   * this project"), this stamps the conversation with the project on
   * first send. Ignored server-side for existing conversations — the
   * stored row always wins.
   */
  projectId?: string | null
  initialMessages?: Message[]
  /** Client-side tool handlers — execute tools in the browser without server round-trip */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onToolCall?: (params: { toolCall: any }) => void | Promise<void>
  /**
   * Called once the assistant's response has finished streaming. Used by
   * `ChatPage` to invalidate the conversations list query so the sidebar
   * picks up newly-created conversations without waiting for the next
   * mount or a hard refresh. Belt-and-braces alongside the
   * conversationId-watch effect — that effect fires when the URL gets
   * its first ID, this fires when the stream actually completes.
   */
  onFinish?: () => void
}

export function useChat(options: ChatOptions = {}) {
  const { model, systemPrompt, conversationId, projectId, initialMessages, onToolCall, onFinish } = options

  // Refs keep prepareSendMessagesRequest reading the LATEST fields.
  // useAIChat memoises the transport internally, so a closure captured at mount would
  // otherwise pin the request to the initial values.
  const modelRef = useRef(model)
  const systemPromptRef = useRef(systemPrompt)
  const conversationIdRef = useRef(conversationId)
  const projectIdRef = useRef(projectId)
  useEffect(() => { modelRef.current = model }, [model])
  useEffect(() => { systemPromptRef.current = systemPrompt }, [systemPrompt])
  useEffect(() => { conversationIdRef.current = conversationId }, [conversationId])
  useEffect(() => { projectIdRef.current = projectId }, [projectId])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        credentials: 'include',
        // Bandwidth optimisation: send only the latest message, server loads history from DB
        prepareSendMessagesRequest({ messages: msgs, id }) {
          return {
            body: {
              message: msgs[msgs.length - 1],
              allMessages: msgs,
              id,
              model: modelRef.current,
              systemPrompt: systemPromptRef.current,
              conversationId: conversationIdRef.current,
              projectId: projectIdRef.current,
            },
          }
        },
      }),
    [],
  )

  // Seed useAIChat ONCE at mount. Without this, a later prop update to
  // `initialMessages` (triggered when /chat transitions to /chat/:id and
  // useConversationMessages refetches) clobbers the in-flight streaming
  // state, blanking the transcript until reload (C1 in the 2026-04-22
  // audit). After mount we sync stored messages explicitly with
  // setMessages only when chat state is empty — never when a stream is in
  // flight.
  const seedRef = useRef(initialMessages)

  const onFinishRef = useRef(onFinish)
  useEffect(() => { onFinishRef.current = onFinish }, [onFinish])

  const chat = useAIChat({
    messages: seedRef.current,
    messageMetadataSchema,
    transport,
    onToolCall,
    // CRITICAL: without this, addToolApprovalResponse() only stores the
    // approval locally — the server never hears about it and the tool
    // never runs. This callback tells the SDK to auto-resubmit once all
    // pending approval requests have responses. Fixes the "Approve
    // button does nothing" bug in the Workspace connector flow.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => onFinishRef.current?.(),
    onError: (error: Error) => {
      console.error('Chat error:', error)
    },
  })

  // Adopt stored messages on later mounts (e.g. navigating from one
  // conversation to another). Only when chat.messages is empty — so we
  // never overwrite a live stream or optimistic user message.
  useEffect(() => {
    if (!initialMessages || initialMessages.length === 0) return
    if (chat.messages.length > 0) return
    chat.setMessages(initialMessages)
  }, [initialMessages, chat])

  // Extract conversationId from the latest assistant message metadata
  const latestConversationId = (() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const msg = chat.messages[i]
      if (msg?.role === 'assistant') {
        const meta = (msg as unknown as Record<string, unknown>)['metadata'] as MessageMetadata | undefined
        if (meta?.conversationId) return meta.conversationId
      }
    }
    return conversationId
  })()

  return {
    messages: chat.messages,
    isLoading: chat.status === 'streaming' || chat.status === 'submitted',
    error: chat.error?.message ?? null,
    status: chat.status,
    conversationId: latestConversationId,
    sendMessage: chat.sendMessage,
    regenerate: chat.regenerate,
    stop: chat.stop,
    clearMessages: () => chat.setMessages([]),
    setMessages: chat.setMessages,
    addToolApprovalResponse: chat.addToolApprovalResponse,
  }
}
