/**
 * Load a user's MCP connections (Phase 5) into AI SDK MCP clients.
 *
 * Complements `getMCPTools(env)` which reads env-var configs — this
 * function layers per-user connections from the D1 table on top. Tokens
 * are decrypted inline before passing to the MCP client. Connections with
 * `status !== 'active'` or a 'never' policy on ALL their tools are skipped.
 */
import { createMCPClient } from '@ai-sdk/mcp'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and } from 'drizzle-orm'
import { userMcpConnections, userMcpToolPolicies } from '@/server/modules/mcp-connections/db/schema'
import { decrypt } from '@/server/lib/crypto'

export interface UserMcpResult {
  tools: Record<string, unknown>
  cleanup: () => Promise<void>
  /** Debug info per connection — populated in dev logs */
  connections: Array<{ id: string; displayName: string; status: string; toolCount: number }>
}

export async function getUserMcpTools(
  env: {
    DB: D1Database
    TOKEN_ENCRYPTION_KEY?: string
  },
  userId: string,
  /**
   * Optional agent NAME (DO instance name). When supplied, connections
   * whose `allowedAgentNamesJson` is set AND non-empty AND does not
   * include this name are skipped. Empty / null on the row means the
   * connection is available to any agent. See issue #50 slice 9 —
   * Connection Profiles.
   */
  agentName?: string
): Promise<UserMcpResult> {
  const db = drizzle(env.DB)
  const allRows = await db
    .select()
    .from(userMcpConnections)
    .where(and(eq(userMcpConnections.userId, userId), eq(userMcpConnections.status, 'active')))

  // Apply Connection-Profile allow-list. A connection with
  // allowedAgentNamesJson = null / empty array is available to all
  // agents; anything else is restricted to the listed agent names.
  const rows = agentName
    ? allRows.filter((r) => isConnectionAllowedFor(r.allowedAgentNamesJson, agentName))
    : allRows

  if (rows.length === 0) {
    return { tools: {}, cleanup: async () => {}, connections: [] }
  }

  const policyRows = await db
    .select()
    .from(userMcpToolPolicies)
    .where(eq(userMcpToolPolicies.userId, userId))
  const policyMap = new Map<string, string>()
  for (const p of policyRows) policyMap.set(`${p.connectionId}:${p.toolName}`, p.policy)

  const allTools: Record<string, unknown> = {}
  const connections: UserMcpResult['connections'] = []
  const clients: Array<Awaited<ReturnType<typeof createMCPClient>>> = []

  for (const conn of rows) {
    try {
      const accessToken = await decrypt(conn.accessToken, env.TOKEN_ENCRYPTION_KEY)
      const transport =
        conn.transport === 'sse'
          ? {
              type: 'sse' as const,
              url: conn.url,
              ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
            }
          : {
              type: 'http' as const,
              url: conn.url,
              ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
            }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = await createMCPClient({ transport: transport as any })
      clients.push(client)
      const toolSet = (await client.tools()) as Record<string, unknown>

      // Apply per-tool policies. 'never' drops the tool entirely; 'always'
      // and 'ask' keep it (UI approval handles the ask tier). Prefix with
      // the connector slug to prevent name collisions across connections.
      let added = 0
      for (const [name, tool] of Object.entries(toolSet)) {
        const policy = policyMap.get(`${conn.id}:${name}`) ?? 'ask'
        if (policy === 'never') continue
        const prefixed = `${conn.connectorId.replace(/[^a-z0-9]/gi, '_')}_${name}`
        allTools[prefixed] = tool
        added++
      }

      connections.push({
        id: conn.id,
        displayName: conn.displayName,
        status: conn.status,
        toolCount: added,
      })

      // Update last_used_at — fire and forget.
      db.update(userMcpConnections)
        .set({ lastUsedAt: new Date() })
        .where(eq(userMcpConnections.id, conn.id))
        .catch(() => {})
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'user_mcp_connect_failed',
          connectionId: conn.id,
          error: err instanceof Error ? err.message : String(err),
        })
      )
      // Mark as error so the UI surfaces it.
      db.update(userMcpConnections)
        .set({
          status: 'error',
          lastError: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
        })
        .where(eq(userMcpConnections.id, conn.id))
        .catch(() => {})
    }
  }

  const cleanup = async () => {
    await Promise.all(
      clients.map(async (c) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (typeof (c as any).close === 'function') await (c as any).close()
        } catch {
          // ignore
        }
      })
    )
  }

  return { tools: allTools, cleanup, connections }
}

/**
 * Decide whether a connection's allow-list permits this agentName.
 *
 *   null / undefined / empty array  → permitted (no restriction)
 *   array contains agentName        → permitted
 *   array does NOT contain agentName → blocked
 */
function isConnectionAllowedFor(json: string | null, agentName: string): boolean {
  if (!json) return true
  try {
    const v = JSON.parse(json)
    if (!Array.isArray(v) || v.length === 0) return true
    return v.some((x) => typeof x === 'string' && x === agentName)
  } catch {
    return true
  }
}
