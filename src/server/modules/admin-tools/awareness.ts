/**
 * AdminAgent — situational awareness tools (trimmed v2).
 *
 * 3 read-only tools that have no equivalent surface elsewhere:
 *
 * - `list_my_agents`         — agent class registry catalogue
 * - `list_my_connections`    — MCP connections + their providers
 * - `list_my_spaces`         — top-level spaces the user is in
 *
 * Removed in v2 (these duplicated existing UI surfaces, polluting LLM
 * context for no real benefit):
 *   - list_pending_approvals → /dashboard/approvals already shows them
 *   - list_recent_activity   → /dashboard/agent-observability charts
 *   - list_inbox             → /dashboard/inbox is the canonical view
 *
 * The principle: AdminAgent's job is *proposing changes*, not narrating
 * state the user can read directly. Read-only awareness only when no UI
 * already covers it.
 */
import { z } from 'zod'
import { Bot, Plug, Users } from 'lucide-react'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq } from 'drizzle-orm'

import type { ToolDefinition } from '@/shared/agent'
import { listRegisteredAgents } from '@/server/lib/agents/registry'
import { userMcpConnections } from '@/server/modules/mcp-connections/db/schema'
import { conversations, conversationMembers } from '@/server/modules/conversations/db/schema'
import type { AdminToolFactoryArgs } from './types'

// ─── Output schemas ────────────────────────────────────────────────

const AgentSummarySchema = z.object({
  className: z.string(),
  displayName: z.string(),
  description: z.string(),
  category: z.string(),
})
const AgentsListSchema = z.object({ agents: z.array(AgentSummarySchema) })
type AgentsListType = z.infer<typeof AgentsListSchema>

const ConnectionSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  url: z.string(),
  status: z.string(),
})
const ConnectionsListSchema = z.object({
  total: z.number(),
  connections: z.array(ConnectionSummarySchema),
})
type ConnectionsListType = z.infer<typeof ConnectionsListSchema>

const SpaceSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  role: z.string(),
  joinedAt: z.number(),
})
const SpacesListSchema = z.object({ total: z.number(), spaces: z.array(SpaceSummarySchema) })
type SpacesListType = z.infer<typeof SpacesListSchema>

// ─── Factory ───────────────────────────────────────────────────────

export function buildAwarenessTools(
  args: AdminToolFactoryArgs
): ToolDefinition<unknown, unknown>[] {
  const { userId, env } = args

  return [
    {
      name: 'list_my_agents',
      description:
        'List the agent classes registered in this Worker (AssistantAgent, ResearcherAgent, etc.) with display names and descriptions. Use to pick which agentClass to use when proposing a new routine.',
      inputSchema: z.object({}),
      outputSchema: AgentsListSchema,
      execute: async (): Promise<AgentsListType> => {
        const agents = listRegisteredAgents().map((a) => ({
          className: a.className,
          displayName: a.displayName,
          description: a.description,
          category: a.category,
        }))
        return { agents }
      },
      render: { icon: Bot, displayName: 'List agent classes' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'list_my_connections',
      description:
        "List the user's MCP connections (Gmail, Drive, Calendar, etc.). Returns id, server URL, label, and enabled status. Use to confirm a tool is available before proposing a routine that needs it.",
      inputSchema: z.object({}),
      outputSchema: ConnectionsListSchema,
      execute: async (): Promise<ConnectionsListType> => {
        const db = drizzle(env.DB)
        const rows = await db
          .select()
          .from(userMcpConnections)
          .where(eq(userMcpConnections.userId, userId))
        return {
          total: rows.length,
          connections: rows.map((r) => ({
            id: r.id,
            displayName: r.displayName,
            url: r.url,
            status: r.status,
          })),
        }
      },
      render: { icon: Plug, displayName: 'List connections' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'list_my_spaces',
      description:
        "List the top-level spaces the user is a member of. Returns id, title, summary, and the user's role + joined date in each.",
      inputSchema: z.object({}),
      outputSchema: SpacesListSchema,
      execute: async (): Promise<SpacesListType> => {
        const db = drizzle(env.DB)
        const rows = await db
          .select({
            id: conversations.id,
            title: conversations.title,
            summary: conversations.summary,
            role: conversationMembers.role,
            joinedAt: conversationMembers.joinedAt,
            kind: conversations.kind,
          })
          .from(conversationMembers)
          .innerJoin(conversations, eq(conversationMembers.conversationId, conversations.id))
          .where(and(eq(conversationMembers.userId, userId), eq(conversations.kind, 'space')))
          .orderBy(desc(conversationMembers.joinedAt))
        return {
          total: rows.length,
          spaces: rows.map((r) => ({
            id: r.id,
            title: r.title,
            summary: r.summary,
            role: r.role,
            joinedAt: r.joinedAt,
          })),
        }
      },
      render: { icon: Users, displayName: 'List spaces' },
    } as ToolDefinition<unknown, unknown>,
  ]
}
