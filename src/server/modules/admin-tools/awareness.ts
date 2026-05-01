/**
 * AdminAgent — situational awareness tools.
 *
 * 6 read-only tools that let AdminAgent answer "what's currently set up?"
 * questions before proposing changes. All scoped to the current user.
 *
 * - `list_my_agents`         — agent class registry catalogue
 * - `list_my_connections`    — MCP connections + their providers
 * - `list_my_spaces`         — top-level spaces the user is in
 * - `list_pending_approvals` — what needs the user's review
 * - `list_recent_activity`   — recent audit log entries
 * - `list_inbox`             — recent unified-inbox findings
 *
 * Read-only. No approval gating. Returns shaped summaries (not full rows)
 * so the LLM context stays bounded.
 */
import { z } from 'zod'
import {
  Bot,
  Plug,
  Users,
  CheckSquare,
  History,
  Inbox as InboxIcon,
} from 'lucide-react'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq } from 'drizzle-orm'

import type { ToolDefinition } from '@/shared/agent'
import { listRegisteredAgents } from '@/server/lib/agents/registry'
import { userMcpConnections } from '@/server/modules/mcp-connections/db/schema'
import { pendingApprovals } from '@/server/modules/approvals/db/schema'
import { inboxItems } from '@/server/modules/inbox/db/schema'
import { conversations, conversationMembers } from '@/server/modules/conversations/db/schema'
import { agentRuns } from '@/server/modules/agent-observability/db/schema'
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
const ConnectionsListSchema = z.object({ total: z.number(), connections: z.array(ConnectionSummarySchema) })
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

const ApprovalSummarySchema = z.object({
  id: z.string(),
  agentClass: z.string(),
  agentName: z.string(),
  action: z.string(),
  summary: z.string().nullable(),
  status: z.string(),
  createdAt: z.number(),
})
const ApprovalsListSchema = z.object({ total: z.number(), approvals: z.array(ApprovalSummarySchema) })
type ApprovalsListType = z.infer<typeof ApprovalsListSchema>

const ActivitySummarySchema = z.object({
  id: z.string(),
  agentClass: z.string(),
  agentName: z.string(),
  trigger: z.string(),
  outcome: z.string(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  costUsd: z.number().nullable(),
})
const ActivityListSchema = z.object({ total: z.number(), runs: z.array(ActivitySummarySchema) })
type ActivityListType = z.infer<typeof ActivityListSchema>

const InboxSummarySchema = z.object({
  id: z.string(),
  kind: z.string(),
  summary: z.string(),
  importance: z.string(),
  agentClass: z.string().nullable(),
  readAt: z.number().nullable(),
  decidedAt: z.number().nullable(),
  createdAt: z.number(),
})
const InboxListSchema = z.object({ total: z.number(), items: z.array(InboxSummarySchema) })
type InboxListType = z.infer<typeof InboxListSchema>

// ─── Factory ───────────────────────────────────────────────────────

export function buildAwarenessTools(
  args: AdminToolFactoryArgs,
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
        'List the user\'s MCP connections (Gmail, Drive, Calendar, etc.). Returns id, server URL, label, and enabled status. Use to confirm a tool is available before proposing a routine that needs it.',
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
        'List the top-level spaces the user is a member of. Returns id, title, summary, and the user\'s role + joined date in each.',
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
          .where(
            and(
              eq(conversationMembers.userId, userId),
              eq(conversations.kind, 'space'),
            ),
          )
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

    {
      name: 'list_pending_approvals',
      description:
        'List the user\'s pending approvals — actions queued by agents waiting for review. Returns agentClass, action, summary, and id. Use when the user asks "what needs my approval?"',
      inputSchema: z.object({
        limit: z.number().int().positive().max(50).default(20),
      }),
      outputSchema: ApprovalsListSchema,
      execute: async (input: { limit: number }): Promise<ApprovalsListType> => {
        const db = drizzle(env.DB)
        const rows = await db
          .select()
          .from(pendingApprovals)
          .where(
            and(
              eq(pendingApprovals.userId, userId),
              eq(pendingApprovals.status, 'pending'),
            ),
          )
          .orderBy(desc(pendingApprovals.createdAt))
          .limit(input.limit)
        return {
          total: rows.length,
          approvals: rows.map((r) => ({
            id: r.id,
            agentClass: r.agentClass,
            agentName: r.agentName,
            action: r.action,
            summary: r.summary,
            status: r.status,
            createdAt: r.createdAt,
          })),
        }
      },
      render: { icon: CheckSquare, displayName: 'Pending approvals' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'list_recent_activity',
      description:
        'List recent agent runs across the user\'s agents. Returns class, trigger, outcome, cost. Use for "what has my agent been doing today?" / "did anything error overnight?"',
      inputSchema: z.object({
        limit: z.number().int().positive().max(50).default(20),
      }),
      outputSchema: ActivityListSchema,
      execute: async (input: { limit: number }): Promise<ActivityListType> => {
        const db = drizzle(env.DB)
        const rows = await db
          .select()
          .from(agentRuns)
          .where(eq(agentRuns.userId, userId))
          .orderBy(desc(agentRuns.startedAt))
          .limit(input.limit)
        return {
          total: rows.length,
          runs: rows.map((r) => ({
            id: r.id,
            agentClass: r.agentClass,
            agentName: r.agentName,
            trigger: r.trigger,
            outcome: r.outcome,
            startedAt: r.startedAt,
            finishedAt: r.finishedAt,
            costUsd: r.costUsd,
          })),
        }
      },
      render: { icon: History, displayName: 'Recent activity' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'list_inbox',
      description:
        'List recent unified-inbox items (findings + decisions queued by agents). Returns kind, summary, importance, read/decided state. Use when the user asks "what\'s in my inbox?" before proposing actions.',
      inputSchema: z.object({
        limit: z.number().int().positive().max(50).default(20),
        unreadOnly: z.boolean().default(false),
      }),
      outputSchema: InboxListSchema,
      execute: async (input: { limit: number; unreadOnly: boolean }): Promise<InboxListType> => {
        const db = drizzle(env.DB)
        const conditions = [eq(inboxItems.userId, userId)]
        const baseQuery = db
          .select()
          .from(inboxItems)
          .where(and(...conditions))
          .orderBy(desc(inboxItems.createdAt))
          .limit(input.limit)
        const rows = await baseQuery
        const filtered = input.unreadOnly ? rows.filter((r) => r.readAt == null) : rows
        return {
          total: filtered.length,
          items: filtered.map((r) => ({
            id: r.id,
            kind: r.kind,
            summary: r.summary,
            importance: r.importance ?? 'medium',
            agentClass: r.agentClass,
            readAt: r.readAt,
            decidedAt: r.decidedAt,
            createdAt: r.createdAt,
          })),
        }
      },
      render: { icon: InboxIcon, displayName: 'List inbox' },
    } as ToolDefinition<unknown, unknown>,
  ]
}
