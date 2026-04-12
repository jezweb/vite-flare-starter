/**
 * useChat Hook
 *
 * Wraps AI SDK's useChat for streaming chat with Workers AI.
 * Handles model selection and provides a clean API for the chat UI.
 */
import { useChat as useAIChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

export type { UIMessage as Message } from 'ai'

interface ChatOptions {
  model?: string
  systemPrompt?: string
}

export function useChat(options: ChatOptions = {}) {
  const { model, systemPrompt } = options

  const chat = useAIChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { model, systemPrompt },
      credentials: 'include',
    }),
    onError: (error: Error) => {
      console.error('Chat error:', error)
    },
  })

  return {
    messages: chat.messages,
    isLoading: chat.status === 'streaming' || chat.status === 'submitted',
    error: chat.error?.message ?? null,
    status: chat.status,
    sendMessage: chat.sendMessage,
    stop: chat.stop,
    clearMessages: () => chat.setMessages([]),
  }
}
