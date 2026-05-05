/**
 * ChatAgent — Durable Object backed by `@cloudflare/ai-chat`'s AIChatAgent.
 *
 * SDK-aligned chat primitive. One DO per (user, conversation) pair, named
 * `user-{userId}-conv-{conversationId}`. The DO owns:
 *   - Per-conversation message history in SQLite (via SDK's persistence)
 *   - WebSocket fan-out to all connected clients of that conversation
 *   - The full chat agent loop: system prompt assembly, tool calls,
 *     streaming response, MCP integration
 *
 * Cross-module projection: `onChatResponse` writes-through to the shared
 * `conversation_messages` table in D1 so Spaces/Projects/Memories/AdminTools
 * can read chat content without reaching into the DO. The DO is authoritative
 * for live state; D1 is the cross-module read projection.
 *
 * Sidebar listing reads from the existing `conversations` table (where
 * kind='chat'). No separate `chat_sessions` table needed — DO instance name
 * is derivable: `user-${userId}-conv-${conversationId}`.
 *
 * Phase 1 status: stub. The real `onChatMessage` body is ported from
 * `buildChatAgent` (server/lib/ai/agent.ts) in the next commit. Routed via
 * `routeAgentRequest` at `/agents/chat-agent/{instance-name}` once the
 * client switches over.
 *
 * @see chat-aichatagent-migration-plan-2026-05-04.md
 * @see https://www.npmjs.com/package/@cloudflare/ai-chat
 */
import { AIChatAgent, type OnChatMessageOptions } from '@cloudflare/ai-chat'
import { streamText, convertToModelMessages, pruneMessages, type StreamTextOnFinishCallback, type ToolSet } from 'ai'
import type { Env } from '@/server/index'

/**
 * Result of parsing a DO instance name — `user-{userId}-conv-{conversationId}`.
 * Returns nulls when the name doesn't match the expected shape so callers
 * can reject early without throwing.
 */
function parseInstanceName(name: string): { userId: string | null; conversationId: string | null } {
  const match = name.match(/^user-([^-].*?)-conv-(.+)$/)
  if (!match) return { userId: null, conversationId: null }
  return { userId: match[1] ?? null, conversationId: match[2] ?? null }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export class ChatAgent extends AIChatAgent<Env> {
  /**
   * Storage cap. SQLite auto-deletes oldest beyond this. Independent of the
   * per-turn LLM context (handled by `pruneMessages` inside `onChatMessage`).
   */
  override maxPersistedMessages = 200

  /**
   * Wait for MCP connections to restore after hibernation before processing.
   * Without this, `getAITools()` can return an incomplete set on first
   * post-hibernate turn.
   */
  override waitForMcpConnections = { timeout: 10_000 } as const

  /**
   * Extract `{ userId, conversationId }` from `this.name`. Throws if the
   * instance name doesn't match the convention — that's a programming
   * error (the route should reject mismatched names before reaching here).
   */
  protected resolveSession(): { userId: string; conversationId: string } {
    const { userId, conversationId } = parseInstanceName(this.name)
    if (!userId || !conversationId) {
      throw new Error(
        `ChatAgent instance name "${this.name}" doesn't match user-{userId}-conv-{conversationId}`,
      )
    }
    return { userId, conversationId }
  }

  override async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions,
  ): Promise<Response | undefined> {
    // Phase 1 stub. The full port from buildChatAgent (system prompt
    // assembly, projects, skills, memory, tools, MCP, prepareStep,
    // telemetry) lands in the next commit. For now we return a tiny
    // streamText so the WebSocket pipe is exercised end-to-end.
    const { userId } = this.resolveSession()
    void userId

    // Lazy import workers-ai-provider so the stub stays import-cheap.
    const { createWorkersAI } = await import('workers-ai-provider')
    const workersai = createWorkersAI({ binding: (this.env as any).AI })

    const result = streamText({
      abortSignal: options?.abortSignal,
      model: workersai('@cf/moonshotai/kimi-k2.6'),
      system:
        'You are a helpful assistant. (Phase 1 stub — full agent loop ports next commit.)',
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: 'before-last-2-messages',
        reasoning: 'before-last-message',
      }),
    })

    return result.toUIMessageStreamResponse()
  }

  /**
   * After every turn, project the new messages to D1 `conversation_messages`
   * so Spaces global search and Projects can read them.
   *
   * Phase 1 stub: no-op. Implementation lands with the full onChatMessage
   * port. The shared `conversations` row is created by the create-session
   * route ahead of the first turn; this hook just appends messages.
   */
  protected override async onChatResponse(): Promise<void> {
    // TODO(phase1-port): write through to conversation_messages via
    // drizzle. Skip messages already present (idempotent). Update
    // conversations.updatedAt.
  }
}
