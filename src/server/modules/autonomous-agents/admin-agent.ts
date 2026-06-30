/**
 * AdminAgent — Claude-Code-style platform management agent (gh #49).
 *
 * Lives inside the app as a member of an auto-provisioned `#admin`
 * Space. The user describes intent in English ("set up a routine that
 * watches X for Y"), AdminAgent assembles a proposal, the user reviews
 * the proposal in /dashboard/approvals, on approve the action runs.
 *
 * Architecture:
 *   - Subclass of `AutonomousAgent` — inherits persona, memory blocks,
 *     daily budget cap, run audit, the approval queue mechanics.
 *   - Custom `getToolDefinitions()` returns the admin tool catalog
 *     (routines, awareness) bound to `this.requestApproval`.
 *   - `executeApproved(action, payload)` dispatches to the right
 *     mutation handler when the user approves a queued action.
 *
 * Trust model (v1):
 *   - Read tools (list/inspect): auto-execute, no approval
 *   - Write tools (create/update/pause/run-now/delete): all gated by
 *     `requestApproval`, no auto-execute paths in v1
 *   - MCP tools NOT inherited — admin actions are platform-internal,
 *     not third-party. Explicit override of base buildToolset.
 *   - Recursion guard: `create_routine` rejects `agentClass=AdminAgent`
 *
 * Partition: `${userId}:admin` (existing AutonomousAgent convention).
 * Each user gets their own AdminAgent DO instance with isolated state.
 */
import { getAgentByName } from 'agents'
import {
  AutonomousAgent,
  type AutonomousAgentEnv,
  type AutonomousAgentState,
} from '@/server/lib/agents/autonomous-agent'
import type { ToolDefinition } from '@/shared/agent'
import { buildAdminTools, type AdminToolFactoryArgs } from '@/server/modules/admin-tools'
import {
  createRoutine,
  updateRoutine,
  deleteRoutine,
  getRoutine,
} from '@/server/modules/routines/storage'
import { fireRoutine } from '@/server/modules/routines/scheduler'
import type { AssistantAgent } from './assistant-agent'

// AdminAgent doesn't need any extra bindings beyond the base.
type Env = AutonomousAgentEnv

const ADMIN_PERSONA = `You are the Platform Admin for this user. Your job is to help them configure and operate their workspace — routines, agents, connections, spaces, approvals — through natural conversation.

How you work:

1. **Understand the intent first.** When the user describes something they want, restate the goal in your own words before proposing a config. ("So you want a routine that runs every weekday at 9am, scans my Gmail inbox for invoice attachments, and saves them to a Drive folder. Is that right?")

2. **Survey before you change.** Use \`list_my_agents\`, \`list_my_connections\`, \`list_routines\` to confirm the user has the right pieces in place. Reference the specific id/name when you do.

3. **Propose, don't act.** Every write action you call (create/update/pause/run/delete) is queued for the user's approval — they'll see it in /dashboard/approvals. After you propose, tell the user the approval id and what it'll do.

4. **One step at a time.** Don't chain "create routine + invite agent + connect Gmail" in one turn. Help the user complete each step, then tell them what's next.

5. **Stay scoped.** You can only see / change THIS USER's stuff. You can't manage secrets, change auth, or modify the codebase — for those, point them at the right page (Settings / Connections).

Vocabulary you use:
- **Routine** — a saved recurring agent: "fire AssistantAgent with input X every 6 hours"
- **Agent class** — the AutonomousAgent subclass (AssistantAgent, ResearcherAgent, etc.)
- **Connection** — a per-user OAuth/bearer link to an MCP server (Gmail, Drive, Calendar)
- **Space** — a multi-participant chat room (you live in one called #admin)
- **Approval** — a queued write action waiting for user review
- **Inbox finding** — agent-emitted notification ("I noticed X")
- **Activity** — agent_runs audit log

If the user asks for something you can't do (delete users, rotate secrets, edit code), tell them which page handles it and stop. Don't pretend you can.`

export class AdminAgent extends AutonomousAgent<Env, AutonomousAgentState> {
  static override readonly className = 'AdminAgent'
  static readonly metadata = {
    displayName: 'Platform Admin',
    description:
      "Configures + operates the platform on the user's behalf. Lives in #admin space. Every write action queues for approval.",
    userPurpose:
      'Use to configure routines, agents, and connections by chatting in plain English. Every change goes through your approval.',
    category: 'meta' as const,
  }

  override initialState: AutonomousAgentState = {
    ...AutonomousAgent.defaultInitialState(),
    name: 'AdminAgent',
    persona: ADMIN_PERSONA,
    // Sonnet for complex multi-tool reasoning. Admin questions tend to
    // chain (list → reason → propose), so the better tool-loop model is
    // worth the marginal cost. Forks can override via setState if they
    // want Haiku for cost.
    //
    // Catalogue/OpenRouter id format uses a DOT (`claude-sonnet-4.6`).
    // The dash form (`4-6`) is only the direct-Anthropic SDK spelling, which
    // resolveModel derives via regex on the direct path. On the default
    // OpenRouter-only deployment the dash form is forwarded verbatim and 404s
    // ("model not found"), so keep the dotted catalogue id here.
    modelId: 'anthropic/claude-sonnet-4.6',
  }

  protected override async getToolDefinitions(): Promise<ToolDefinition<unknown, unknown>[]> {
    if (!this.state.userId) {
      // No owner = no tools. The base getToolDefinitions returns the
      // chat-tool catalog by default, which would include destructive
      // unscoped tools. We'd rather refuse cleanly.
      return []
    }
    const args: AdminToolFactoryArgs = {
      requestApproval: (action, payload, summary) => this.requestApproval(action, payload, summary),
      userId: this.state.userId,
      env: this.env as unknown as AdminToolFactoryArgs['env'],
    }
    return buildAdminTools(args)
  }

  /**
   * Dispatch on the action name written by `requestApproval`. Each
   * action maps to a routine-storage mutation. The payload shape is
   * defined by the corresponding admin-tools/routines.ts tool.
   */
  override async executeApproved(action: string, payload: unknown): Promise<unknown> {
    if (!this.state.userId) {
      throw new Error('AdminAgent.executeApproved called without an owner')
    }
    const env = this.env as unknown as { DB: D1Database; [k: string]: unknown }
    const userId = this.state.userId

    switch (action) {
      case 'admin_create_routine': {
        const input = payload as Parameters<typeof createRoutine>[1]
        return createRoutine(env, { ...input, userId })
      }

      case 'admin_update_routine': {
        const { id, patch } = payload as { id: string; patch: Parameters<typeof updateRoutine>[3] }
        const updated = await updateRoutine(env, id, userId, patch)
        if (!updated) throw new Error(`Routine ${id} not found`)
        return updated
      }

      case 'admin_pause_routine': {
        const { id } = payload as { id: string }
        const updated = await updateRoutine(env, id, userId, { enabled: false })
        if (!updated) throw new Error(`Routine ${id} not found`)
        return updated
      }

      case 'admin_run_routine_now': {
        const { id } = payload as { id: string }
        const r = await getRoutine(env, id, userId)
        if (!r) throw new Error(`Routine ${id} not found`)
        // Fire async — same path as POST /api/routines/:id/fire.
        await fireRoutine(env, r)
        return { fired: true, routineId: id }
      }

      case 'admin_delete_routine': {
        const { id } = payload as { id: string }
        const r = await getRoutine(env, id, userId)
        if (!r) throw new Error(`Routine ${id} not found`)
        await deleteRoutine(env, id, userId)
        return { deleted: true, id, name: r.name }
      }

      case 'admin_set_agent_persona': {
        const { agentClass, agentName, persona } = payload as {
          agentClass: string
          agentName: string
          persona: string
        }
        const stub = await this.resolveAgentStub(agentClass, agentName, userId)
        await stub.setOwner(userId, agentName)
        await stub.setPersona(persona)
        return { agentClass, agentName, updated: 'persona' }
      }

      case 'admin_set_agent_model': {
        const { agentClass, agentName, modelId } = payload as {
          agentClass: string
          agentName: string
          modelId: string
        }
        const stub = await this.resolveAgentStub(agentClass, agentName, userId)
        await stub.setOwner(userId, agentName)
        await stub.setModel(modelId)
        return { agentClass, agentName, modelId, updated: 'model' }
      }

      case 'admin_set_agent_budget': {
        const { agentClass, agentName, dailyBudgetUsd } = payload as {
          agentClass: string
          agentName: string
          dailyBudgetUsd: number | null
        }
        const stub = await this.resolveAgentStub(agentClass, agentName, userId)
        await stub.setOwner(userId, agentName)
        await stub.setDailyBudget(dailyBudgetUsd)
        return { agentClass, agentName, dailyBudgetUsd, updated: 'budget' }
      }

      default:
        return super.executeApproved(action, payload) // throws — unknown action
    }
  }

  /**
   * Resolve an arbitrary AutonomousAgent stub by class name. Mirrors
   * the dispatch in `src/server/modules/agent-instances/routes.ts` so
   * GUI-driven and chat-driven edits go through the same RPC path.
   */
  private async resolveAgentStub(agentClass: string, agentName: string, userId: string) {
    const env = this.env as unknown as {
      AssistantAgent?: DurableObjectNamespace<AssistantAgent>
      [k: string]: unknown
    }
    const ns = (env as Record<string, unknown>)[agentClass] as
      | DurableObjectNamespace<AssistantAgent>
      | undefined
    if (!ns) throw new Error(`No DurableObject binding for class ${agentClass}`)
    return getAgentByName(ns, `${userId}:${agentName}`)
  }
}
