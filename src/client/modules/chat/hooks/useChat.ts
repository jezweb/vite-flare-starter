/**
 * useChat Hook — SDK-aligned (Phase 1C)
 *
 * Wraps `@cloudflare/ai-chat/react`'s `useAgentChat` (which extends AI SDK's
 * `useChat`) on top of `agents/react`'s `useAgent` for the WebSocket
 * connection. Replaces the legacy HTTP `DefaultChatTransport` → `/api/chat`
 * pattern.
 *
 * Each `useChat` instance opens a WebSocket to a `ChatAgent` Durable Object
 * named `user-{userId}-conv-{conversationId}`. The DO owns the message
 * history (SQLite-persisted), the agent loop, and the tool surface. The DO
 * also writes-through to D1 `conversation_messages` so cross-module readers
 * (Spaces global search, Projects, AdminTools) keep working.
 *
 * For a brand-new chat (no conversationId), the hook generates a fresh UUID
 * at first call so the DO instance is addressable immediately. The caller
 * uses `conversationId` from the return for navigation / project-stamping.
 *
 * Public surface kept compatible with the legacy hook so ChatPage doesn't
 * need surgery: `messages`, `sendMessage`, `regenerate`, `stop`,
 * `setMessages`, `clearMessages`, `addToolApprovalResponse`, `status`,
 * `error`, `isLoading`, `conversationId`.
 */
import { useAgent } from 'agents/react'
import { useAgentChat } from '@cloudflare/ai-chat/react'
import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from 'ai'
import { useMemo, useRef, useEffect } from 'react'
import { type MessageMetadata } from '@/shared/schemas/chat.schema'

export type Message = UIMessage
export type { MessageMetadata }

interface ChatOptions {
  /**
   * Required — the authenticated user's id. The hook needs this to compute
   * the DO instance name. Pass `session?.user?.id` from `useSession()`.
   * The hook does not render meaningful state until this is set.
   */
  userId?: string
  /** Default model; can be changed per send via the model picker. */
  model?: string
  /**
   * Conversation id. When omitted, the hook generates a fresh UUID so the
   * DO is addressable immediately. The caller reads back `conversationId`
   * from the return (always present once the hook is mounted).
   */
  conversationId?: string
  /**
   * Stamps a new conversation with a project on first send. The server
   * (ChatAgent.onChatMessage) only honours this for the FIRST turn — once
   * the `conversations` row exists, the stored row wins.
   */
  projectId?: string | null
  /**
   * Seed messages used by the SDK's `getInitialMessages` when the DO's
   * SQLite storage is empty. Bridges legacy conversations (created via
   * the old HTTP route, persisted in D1 only) into the new DO-authoritative
   * flow — the DO copies these into its own storage on first connect.
   */
  initialMessages?: Message[]
  /** Client-side tool handlers — execute tools in the browser without server round-trip. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onToolCall?: (params: { toolCall: any; addToolOutput: (output: { toolCallId: string; output: unknown }) => void }) => void | Promise<void>
  /**
   * Called after the assistant's response finishes streaming. Fork users
   * typically use this to invalidate the conversations sidebar query so
   * newly-created conversations appear without a refresh.
   */
  onFinish?: () => void
}

/**
 * Build the `ChatAgent` DO instance name. Must match the server-side
 * `parseInstanceName` parser in `chat-agent.ts`.
 */
function buildInstanceName(userId: string, conversationId: string): string {
  return `user-${userId}-conv-${conversationId}`
}

export function useChat(options: ChatOptions = {}) {
  const { userId, model, conversationId: providedConversationId, projectId, initialMessages, onToolCall, onFinish } = options

  // Allocate a conversation id if the caller didn't provide one. The
  // useMemo + ref pair keeps the id stable across renders without
  // creating one until both userId is present and we need a session.
  // This way, components that mount before auth resolves don't burn
  // through random UUIDs.
  const allocatedIdRef = useRef<string | null>(null)
  const conversationId = useMemo(() => {
    if (providedConversationId) {
      // Switching conversations — reset our auto-allocated id so a later
      // unmount-back-to-new doesn't reuse the old one.
      allocatedIdRef.current = null
      return providedConversationId
    }
    if (!allocatedIdRef.current) {
      allocatedIdRef.current = crypto.randomUUID()
    }
    return allocatedIdRef.current
  }, [providedConversationId])

  // Static names used by useAgent. The agent SDK normalises class names
  // to kebab-case for routing — `ChatAgent` → `/agents/chat-agent/...`.
  // Pass the PascalCase form here; the hook handles the conversion.
  const instanceName = userId ? buildInstanceName(userId, conversationId) : ''

  const agent = useAgent({
    agent: 'ChatAgent',
    name: instanceName,
  })

  // Refs let the body callback see the latest model / projectId without
  // forcing useAgentChat to re-bind on every change. The SDK re-evaluates
  // body() per send, so we always pick up the current values.
  const modelRef = useRef(model)
  const projectIdRef = useRef(projectId)
  useEffect(() => { modelRef.current = model }, [model])
  useEffect(() => { projectIdRef.current = projectId }, [projectId])

  const onFinishRef = useRef(onFinish)
  useEffect(() => { onFinishRef.current = onFinish }, [onFinish])

  // Seed-messages ref — captured at hook mount and used by getInitialMessages
  // exactly once. Re-renders that change `initialMessages` after first
  // connect don't re-seed (DO is already populated).
  const seedRef = useRef(initialMessages)

  // useAgentChat extends AI SDK's useChat. The body field flows to the
  // server via options.body in onChatMessage. Server reads model + projectId
  // from there; the rest of the request body (messages, clientTools) is
  // SDK-managed.
  const chat = useAgentChat({
    agent,
    body: () => ({
      model: modelRef.current,
      projectId: projectIdRef.current,
    }),
    // Bridge legacy D1-stored conversations into the DO. Called only when
    // the DO's SQLite storage is empty — afterward the DO is authoritative.
    getInitialMessages: seedRef.current && seedRef.current.length > 0
      ? async () => seedRef.current!
      : undefined,
    onToolCall,
    // CRITICAL: without this, addToolApprovalResponse() only stores the
    // approval locally — the server never hears about it and the tool
    // never runs. This callback tells the SDK to auto-resubmit once all
    // pending approval requests have responses. Same pattern as the
    // legacy HTTP path.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => onFinishRef.current?.(),
    onError: (error: Error) => {
      console.error('Chat error:', error)
    },
  })

  return {
    messages: chat.messages,
    isLoading: chat.status === 'streaming' || chat.status === 'submitted',
    error: chat.error?.message ?? null,
    status: chat.status,
    /**
     * Always present — generated upfront if not provided. Caller uses this
     * to navigate to `/chat/:conversationId` after the first send.
     */
    conversationId,
    sendMessage: chat.sendMessage,
    regenerate: chat.regenerate,
    stop: chat.stop,
    clearMessages: () => chat.setMessages([]),
    setMessages: chat.setMessages,
    addToolApprovalResponse: chat.addToolApprovalResponse,
  }
}
