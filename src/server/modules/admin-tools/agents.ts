/**
 * AdminAgent — per-instance agent management tools.
 *
 * Lets the user say "make AssistantAgent's persona shorter" or "cap
 * AdminAgent at $0.50/day" and have AdminAgent propose the change.
 *
 * 1 read tool + 3 write tools (all approval-gated):
 *   - list_agent_instances     — alias for the list endpoint, scoped
 *                                to current user. Read-only.
 *   - inspect_agent            — read one instance's full state.
 *   - set_agent_persona        — propose persona change (approval).
 *   - set_agent_model          — propose model change (approval).
 *   - set_agent_budget         — propose daily budget change (approval).
 *
 * Calls back through the same /api/agent-instances endpoints used by
 * the GUI, so chat-driven and GUI-driven edits go through one path.
 *
 * Recursion guard: tools refuse to act on AdminAgent itself for
 * persona changes (would mutate this very agent mid-conversation).
 * Budget + model on AdminAgent are allowed since those don't change
 * decision-making mid-turn.
 */
import { z } from 'zod'
import { Bot, ScanText, Sparkles, Cpu, PiggyBank } from 'lucide-react'
import { drizzle } from 'drizzle-orm/d1'
import { eq, sql } from 'drizzle-orm'

import type { ToolDefinition } from '@/shared/agent'
import { agentRuns } from '@/server/modules/agent-observability/db/schema'
import { getAgentMetadata } from '@/server/lib/agents/registry'
import type { AdminToolFactoryArgs } from './types'

const InstanceRefSchema = z.object({
  agentClass: z.string().min(1).max(80),
  agentName: z.string().min(1).max(120),
})
type InstanceRef = z.infer<typeof InstanceRefSchema>

const PersonaInputSchema = InstanceRefSchema.extend({
  persona: z.string().min(20).max(20_000),
})
type PersonaInput = z.infer<typeof PersonaInputSchema>

const ModelInputSchema = InstanceRefSchema.extend({
  modelId: z
    .string()
    .min(1)
    .max(120)
    .describe('Full model id (provider/model). See models.flared.au.'),
})
type ModelInput = z.infer<typeof ModelInputSchema>

const BudgetInputSchema = InstanceRefSchema.extend({
  dailyBudgetUsd: z.number().positive().nullable().describe('USD cap or null to remove the cap.'),
})
type BudgetInput = z.infer<typeof BudgetInputSchema>

const InstanceSummarySchema = z.object({
  agentClass: z.string(),
  agentName: z.string(),
  displayName: z.string(),
  runs: z.number(),
  totalCostUsd: z.number().nullable(),
  lastRunAt: z.number(),
})
const ListSchema = z.object({ total: z.number(), instances: z.array(InstanceSummarySchema) })
type ListType = z.infer<typeof ListSchema>

const InspectSchema = z.union([
  z.object({
    ok: z.literal(true),
    agentClass: z.string(),
    agentName: z.string(),
    runs: z.number(),
    totalCostUsd: z.number().nullable(),
    lastRunAt: z.number(),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
])
type InspectType = z.infer<typeof InspectSchema>

const ApprovalQueuedSchema = z.union([
  z.object({
    ok: z.literal(true),
    approvalId: z.string(),
    status: z.literal('pending'),
    summary: z.string(),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
])
type ApprovalQueuedType = z.infer<typeof ApprovalQueuedSchema>

export function buildAgentManagementTools(
  args: AdminToolFactoryArgs
): ToolDefinition<unknown, unknown>[] {
  const { requestApproval, userId, env } = args

  return [
    {
      name: 'list_agent_instances',
      description:
        "List the user's agent instances (the agents that have actually run, derived from agent_runs). Each row has class, name, runs, total cost, last activity. Use to recall what already exists before proposing a state change.",
      inputSchema: z.object({}),
      outputSchema: ListSchema,
      execute: async (): Promise<ListType> => {
        const db = drizzle(env.DB)
        const rows = await db
          .select({
            agentClass: agentRuns.agentClass,
            agentName: agentRuns.agentName,
            runs: sql<number>`COUNT(*)`,
            totalCostUsd: sql<number | null>`SUM(${agentRuns.costUsd})`,
            lastRunAt: sql<number>`MAX(${agentRuns.startedAt})`,
          })
          .from(agentRuns)
          .where(eq(agentRuns.userId, userId))
          .groupBy(agentRuns.agentClass, agentRuns.agentName)
          .orderBy(sql`MAX(${agentRuns.startedAt}) DESC`)
        return {
          total: rows.length,
          instances: rows.map((r) => ({
            agentClass: r.agentClass,
            agentName: r.agentName,
            displayName: getAgentMetadata(r.agentClass)?.displayName ?? r.agentClass,
            runs: r.runs,
            totalCostUsd: r.totalCostUsd,
            lastRunAt: r.lastRunAt,
          })),
        }
      },
      render: { icon: Bot, displayName: 'List agent instances' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'inspect_agent',
      description:
        "Get summary stats for one agent instance. Returns runs, total cost, and last run timestamp. The instance's full state (persona, model, budget) is on the Agents page — this read-only tool surfaces only the activity summary that's safe to include in chat.",
      inputSchema: InstanceRefSchema,
      outputSchema: InspectSchema,
      execute: async (input: InstanceRef): Promise<InspectType> => {
        const db = drizzle(env.DB)
        const [row] = await db
          .select({
            runs: sql<number>`COUNT(*)`,
            totalCostUsd: sql<number | null>`SUM(${agentRuns.costUsd})`,
            lastRunAt: sql<number>`MAX(${agentRuns.startedAt})`,
          })
          .from(agentRuns)
          .where(
            sql`${agentRuns.userId} = ${userId}
                AND ${agentRuns.agentClass} = ${input.agentClass}
                AND ${agentRuns.agentName} = ${input.agentName}`
          )
        if (!row || row.runs === 0) {
          return {
            ok: false as const,
            error: `No runs found for ${input.agentClass}/${input.agentName} — instance may not exist yet.`,
          }
        }
        return {
          ok: true as const,
          agentClass: input.agentClass,
          agentName: input.agentName,
          runs: row.runs,
          totalCostUsd: row.totalCostUsd,
          lastRunAt: row.lastRunAt,
        }
      },
      render: { icon: ScanText, displayName: 'Inspect agent' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'set_agent_persona',
      description:
        "Propose changing one agent instance's persona (system prompt). Returns an approval id — the change is NOT applied until the user reviews and approves. Refuses to change AdminAgent's own persona (would mutate this agent mid-conversation).",
      inputSchema: PersonaInputSchema,
      outputSchema: ApprovalQueuedSchema,
      execute: async (input: PersonaInput): Promise<ApprovalQueuedType> => {
        if (input.agentClass === 'AdminAgent') {
          return {
            ok: false as const,
            error:
              "Cannot change AdminAgent's persona via AdminAgent — would mutate this very agent mid-conversation. Edit it on the Agents page.",
          }
        }
        try {
          const summary = `Update persona of ${input.agentClass}/${input.agentName} (${input.persona.length} chars)`
          const result = await requestApproval('admin_set_agent_persona', input, summary)
          return { ok: true as const, ...result, summary }
        } catch (err) {
          return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
        }
      },
      render: { icon: Sparkles, displayName: 'Propose persona update' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'set_agent_model',
      description:
        'Propose changing one agent instance\'s default model. Returns an approval id. Use full model ids (e.g. "anthropic/claude-haiku-4.5"). See models.flared.au.',
      inputSchema: ModelInputSchema,
      outputSchema: ApprovalQueuedSchema,
      execute: async (input: ModelInput): Promise<ApprovalQueuedType> => {
        try {
          const summary = `Switch ${input.agentClass}/${input.agentName} to model ${input.modelId}`
          const result = await requestApproval('admin_set_agent_model', input, summary)
          return { ok: true as const, ...result, summary }
        } catch (err) {
          return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
        }
      },
      render: { icon: Cpu, displayName: 'Propose model swap' },
    } as ToolDefinition<unknown, unknown>,

    {
      name: 'set_agent_budget',
      description:
        "Propose changing one agent instance's daily USD budget cap. Pass null to remove the cap. Returns an approval id.",
      inputSchema: BudgetInputSchema,
      outputSchema: ApprovalQueuedSchema,
      execute: async (input: BudgetInput): Promise<ApprovalQueuedType> => {
        try {
          const cap = input.dailyBudgetUsd == null ? 'no cap' : `$${input.dailyBudgetUsd}/day`
          const summary = `Set ${input.agentClass}/${input.agentName} budget to ${cap}`
          const result = await requestApproval('admin_set_agent_budget', input, summary)
          return { ok: true as const, ...result, summary }
        } catch (err) {
          return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
        }
      },
      render: { icon: PiggyBank, displayName: 'Propose budget update' },
    } as ToolDefinition<unknown, unknown>,
  ]
}
