/**
 * SpaceAgent — Durable Object backing a single Space (multi-user multi-agent room).
 *
 * One DO instance per Space (`idFromName(spaceId)`). Holds:
 *   - WebSocket connections from currently-online human members
 *   - Per-connection state (userId, joinedAt) for presence
 *   - No conversation message history — that lives in D1
 *     (`conversation_messages` keyed by `conversationId = spaceId`)
 *
 * Lifecycle:
 *   - `onConnect`: authenticate via better-auth cookies on the upgrade
 *     request, verify membership, attach state, broadcast presence
 *   - `onClose`:  broadcast new presence so members see who left
 *   - `onMessage`: clients don't send messages over WS — they POST to
 *     `/api/spaces/:id/messages` and the route calls `broadcastNewMessage`
 *     via DO RPC
 *
 * Why DO not Hono SSE: WebSocket fan-out is the natural fit for "everyone
 * sees the new message at the same time", presence works trivially via
 * `getConnections()`, and the DO can also be the @-mention dispatch
 * coordinator (Phase 1 dispatch is REST-route-driven; Phase 2 may move
 * to DO RPC for typing / streaming).
 *
 * Auth: the WS upgrade request carries the `better-auth.session` cookie
 * automatically (same-origin). We re-verify it inside `onConnect` rather
 * than trusting a client-passed token. If the user isn't a member of the
 * space, the connection is closed with code 4403.
 */
import { Agent, type Connection, type ConnectionContext } from 'agents'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import {
  conversationMembers,
  conversationMessages,
  conversations,
} from '@/server/modules/conversations/db/schema'
import { createAuthFromEnv } from '@/server/modules/auth'

interface SpaceConnectionState {
  userId: string
  joinedAt: number
}

// Loose env shape — the agents SDK base wants Cloudflare.Env-ish but we
// know the bindings we need. Cast through unknown when reading.
// biome-ignore lint/suspicious/noExplicitAny: SDK env is loosely typed cross-DO
export class SpaceAgent extends Agent<any, Record<string, never>> {
  static readonly className = 'SpaceAgent'

  /**
   * Authenticate the upgrade request, check space membership, and
   * attach presence state to the connection. Reject anonymous /
   * non-member connections with explicit close codes so the client
   * surface can differentiate "log in" from "you can't join this space".
   */
  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const env = this.env as {
      DB: D1Database
      BETTER_AUTH_SECRET: string
      BETTER_AUTH_URL: string
      GOOGLE_CLIENT_ID?: string
      GOOGLE_CLIENT_SECRET?: string
      EMAIL_API_KEY?: string
      EMAIL_FROM?: string
    }
    const userId = await this.authenticate(env, ctx)
    if (!userId) {
      connection.close(4401, 'unauthorized')
      return
    }
    const member = await this.isMember(env.DB, userId)
    if (!member) {
      connection.close(4403, 'not a space member')
      return
    }
    connection.setState({ userId, joinedAt: Date.now() } as SpaceConnectionState)
    console.log(
      JSON.stringify({
        event: 'space_ws_connect',
        spaceId: this.name,
        userId,
        connectionId: connection.id,
      })
    )
    // Send the new client a welcome with the current online roster so
    // the client doesn't need a separate REST round-trip on connect.
    connection.send(
      JSON.stringify({
        type: 'welcome',
        spaceId: this.name,
        online: this.getOnlineUserIds(),
      })
    )
    // Tell everyone else who just came online.
    this.broadcastPresence([connection.id])
  }

  async onClose(connection: Connection): Promise<void> {
    console.log(
      JSON.stringify({ event: 'space_ws_close', spaceId: this.name, connectionId: connection.id })
    )
    this.broadcastPresence()
  }

  /**
   * Clients don't currently push events over WS — typing indicators
   * etc. are Phase 2. For Phase 1 we just log unknown frames so we can
   * see them in tail.
   */
  override async onMessage(connection: Connection, raw: unknown): Promise<void> {
    console.log(
      JSON.stringify({
        event: 'space_ws_message',
        spaceId: this.name,
        connectionId: connection.id,
        raw: typeof raw === 'string' ? raw.slice(0, 200) : '<binary>',
      })
    )
  }

  // ─── RPC surface (called by REST handlers) ───────────────────────

  /**
   * Called by the POST /api/spaces/:id/messages handler after it has
   * persisted a new message. Loads it back from D1 and broadcasts to
   * every connection. No exclusion — the sender's client wants the
   * canonical row (with id, ts, persisted reactions=null) too so all
   * clients render the same shape.
   */
  async broadcastNewMessage(messageId: string): Promise<void> {
    const env = this.env as { DB: D1Database }
    const [row] = await drizzle(env.DB)
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, messageId))
      .limit(1)
    if (!row) return
    this.broadcast(
      JSON.stringify({
        type: 'message',
        message: this.shapeMessage(row),
      })
    )
  }

  /**
   * Tell every connected client a message was deleted. Called from
   * the DELETE /api/messages/:id handler BEFORE the row is removed
   * from D1 (so the broadcast can include the conversationId for
   * cache routing).
   */
  async broadcastDelete(messageId: string): Promise<void> {
    this.broadcast(JSON.stringify({ type: 'message_deleted', messageId }))
  }

  /** Broadcast the current member-online set. Use after connect / close. */
  broadcastPresence(excludeIds: string[] = []): void {
    this.broadcast(
      JSON.stringify({
        type: 'presence',
        online: this.getOnlineUserIds(),
      }),
      excludeIds
    )
  }

  /** Public RPC for the REST presence endpoint. */
  async getOnline(): Promise<string[]> {
    return this.getOnlineUserIds()
  }

  // ─── Internals ───────────────────────────────────────────────────

  private getOnlineUserIds(): string[] {
    const ids = new Set<string>()
    for (const conn of this.getConnections()) {
      const state = (conn.state ?? null) as SpaceConnectionState | null
      if (state?.userId) ids.add(state.userId)
    }
    return Array.from(ids)
  }

  private async authenticate(
    env: {
      DB: D1Database
      BETTER_AUTH_SECRET: string
      BETTER_AUTH_URL: string
      GOOGLE_CLIENT_ID?: string
      GOOGLE_CLIENT_SECRET?: string
      EMAIL_API_KEY?: string
      EMAIL_FROM?: string
    },
    ctx: ConnectionContext
  ): Promise<string | null> {
    try {
      const auth = createAuthFromEnv(env.DB, env as unknown as Record<string, unknown>)
      const session = await auth.api.getSession({ headers: ctx.request.headers })
      return session?.user?.id ?? null
    } catch (err) {
      console.error(JSON.stringify({ event: 'space_ws_auth_error', error: String(err) }))
      return null
    }
  }

  private async isMember(db: D1Database, userId: string): Promise<boolean> {
    const d = drizzle(db)
    // Verify the conversation actually exists (a typo'd id shouldn't
    // create a phantom DO that accepts connections forever) AND the
    // user is a member.
    const [conv] = await d
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, this.name))
      .limit(1)
    if (!conv) return false
    const [member] = await d
      .select({ id: conversationMembers.id })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, this.name),
          eq(conversationMembers.kind, 'user'),
          eq(conversationMembers.userId, userId)
        )
      )
      .limit(1)
    return !!member
  }

  /** Shape a row from conversation_messages for over-the-wire delivery. */
  private shapeMessage(row: typeof conversationMessages.$inferSelect): {
    id: string
    conversationId: string
    role: string
    parts: unknown
    metadata: unknown
    parentMessageId: string | null
    threadCount: number
    lastThreadAt: number | null
    reactions: unknown
    pinnedAt: number | null
    pinnedByUserId: string | null
    createdAt: string
  } {
    let parts: unknown = []
    try {
      parts = typeof row.parts === 'string' ? JSON.parse(row.parts) : row.parts
    } catch {
      parts = []
    }
    let metadata: unknown
    if (row.metadata) {
      try {
        metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
      } catch {
        metadata = undefined
      }
    }
    let reactions: unknown
    if (row.reactions) {
      try {
        reactions = typeof row.reactions === 'string' ? JSON.parse(row.reactions) : row.reactions
      } catch {
        reactions = undefined
      }
    }
    return {
      id: row.id,
      conversationId: row.conversationId,
      role: row.role,
      parts,
      metadata,
      parentMessageId: row.parentMessageId ?? null,
      threadCount: row.threadCount,
      lastThreadAt: row.lastThreadAt ?? null,
      reactions,
      pinnedAt: row.pinnedAt ?? null,
      pinnedByUserId: row.pinnedByUserId ?? null,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date((row.createdAt as unknown as number) * 1000).toISOString(),
    }
  }
}
