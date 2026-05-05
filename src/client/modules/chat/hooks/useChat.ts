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
import { useRef, useEffect } from 'react'
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
   * Conversation id — REQUIRED. ChatPage now mounts only at
   * `/dashboard/chat/:conversationId`; the bare `/dashboard/chat` redirects
   * via `NewChatRedirect` which mints a UUID upfront. Keeping the id in
   * router state (URL) instead of React state stops `useAgentChat`'s
   * `use(initialMessagesPromise)` from looping when ChatPage remounts on
   * suspense resolve.
   */
  conversationId: string
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

export function useChat(options: ChatOptions) {
  const { userId, model, conversationId, projectId, initialMessages, onToolCall, onFinish } = options

  // Static name used by useAgent. The agent SDK normalises class names
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

  // Seed messages bridge legacy D1 conversations into the DO. The SDK
  // only calls `getInitialMessages` when the DO's SQLite is empty, so a
  // freshly-allocated DO seeds from D1 once and the DO becomes the
  // source of truth thereafter. Capturing the prop in a per-render
  // closure (not a mount-time ref) means navigating between conversations
  // picks up the right seed for each.
  const hasSeed = !!(initialMessages && initialMessages.length > 0)
  const getInitialMessages = hasSeed
    ? async () => initialMessages!
    : undefined

  // useAgentChat extends AI SDK's useChat. The function-form `body` is
  // evaluated per send via `bodyOptionRef.current` in the SDK's
  // `prepareBody`, so the latest `modelRef.current` / `projectIdRef.current`
  // always travel with each chat-request frame and arrive in
  // `options.body` on `ChatAgent.onChatMessage`.
  const chat = useAgentChat({
    agent,
    body: () => ({
      model: modelRef.current,
      projectId: projectIdRef.current,
    }),
    getInitialMessages,
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
