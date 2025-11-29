/**
 * Chat Message Types
 * Shared between client and server for WebSocket communication
 */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  error: string | null
}

// WebSocket message types (client → agent)
export type ClientMessage =
  | { type: 'message'; content: string }
  | { type: 'clear_history' }

// WebSocket message types (agent → client)
export type ServerMessage =
  | { type: 'history'; messages: ChatMessage[] }
  | { type: 'message'; message: ChatMessage }
  | { type: 'stream_start'; messageId: string }
  | { type: 'stream_chunk'; content: string }
  | { type: 'stream_end'; message: ChatMessage }
  | { type: 'error'; error: string }
  | { type: 'rate_limit'; error: string; retryAfter: number }
