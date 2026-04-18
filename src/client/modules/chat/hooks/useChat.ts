/**
 * useChat Hook
 *
 * Wraps AI SDK's useChat for streaming chat with Workers AI.
 * Features: conversation persistence, bandwidth-optimised transport,
 * client-side tool execution, typed metadata, tool approval flow.
 */
import { useChat as useAIChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
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
}

export function useChat(options: ChatOptions = {}) {
  const { model, systemPrompt, conversationId, projectId, initialMessages, onToolCall } = options

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

  const chat = useAIChat({
    messages: initialMessages,
    messageMetadataSchema,
    transport,
    onToolCall,
    onError: (error: Error) => {
      console.error('Chat error:', error)
    },
  })

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
