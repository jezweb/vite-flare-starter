/**
 * useChat Hook
 *
 * Manages chat state and streaming communication with the AI backend
 */
import { useState, useCallback, useRef } from 'react'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

interface UseChatOptions {
  model?: string
  systemPrompt?: string
}

export function useChat(options: UseChatOptions = {}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const { model, systemPrompt } = options

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return

      setError(null)

      // Create user message
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      }

      // Add user message to state
      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)

      // Create assistant message placeholder
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Build messages array for API
      const apiMessages = [
        ...(systemPrompt
          ? [{ role: 'system' as const, content: systemPrompt }]
          : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: content.trim() },
      ]

      try {
        // Create abort controller for cancellation
        abortControllerRef.current = new AbortController()

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            messages: apiMessages,
            model,
          }),
          signal: abortControllerRef.current.signal,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(errorData.error || `Request failed: ${response.status}`)
        }

        // Process SSE stream
        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()

          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Process complete SSE messages
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)

              if (data === '[DONE]') {
                continue
              }

              try {
                const parsed = JSON.parse(data)

                if (parsed.error) {
                  throw new Error(parsed.error)
                }

                if (parsed.content) {
                  // Update assistant message content
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessage.id
                        ? { ...m, content: m.content + parsed.content }
                        : m
                    )
                  )
                }
              } catch (parseError) {
                // Ignore JSON parse errors for partial data
                if (!(parseError instanceof SyntaxError)) {
                  console.error('Parse error:', parseError)
                }
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was cancelled, remove empty assistant message
          setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id))
        } else {
          console.error('Chat error:', err)
          setError(err instanceof Error ? err.message : 'Failed to send message')
          // Remove empty assistant message on error
          setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id))
        }
      } finally {
        setIsLoading(false)
        abortControllerRef.current = null
      }
    },
    [isLoading, messages, model, systemPrompt]
  )

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
    removeMessage,
  }
}
