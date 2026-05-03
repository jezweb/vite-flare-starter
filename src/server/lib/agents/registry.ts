/**
 * Agent registry — discover all AutonomousAgent classes available in
 * this Worker instance + their metadata.
 *
 * Reads from wrangler bindings (env keys typed as DurableObjectNamespace),
 * filters to ones whose backing class declares static metadata, and
 * returns the catalogue. Fork-users adding a new agent only need to
 * (a) add the wrangler binding and (b) add a `static metadata` field
 * to the class — the picker auto-discovers it.
 *
 * No hand-maintained config. The class IS the source of truth.
 */
import type { AgentMetadata } from '@/shared/agent/metadata'

interface AgentClassWithMetadata {
  className: string
  metadata: AgentMetadata
}

/**
 * Hard-coded import list. We could glob the autonomous-agents folder,
 * but explicit imports give us tree-shaking + type safety + a single
 * place that says "here are the agents this fork ships". Adding a new
 * agent: import its class and add to AGENT_CLASSES.
 */
import { AssistantAgent } from '@/server/modules/autonomous-agents/assistant-agent'
import { ResearcherAgent } from '@/server/modules/autonomous-agents/researcher-agent'
import { WriterAgent } from '@/server/modules/autonomous-agents/writer-agent'
import { SweeperAgent } from '@/server/modules/autonomous-agents/sweeper-agent'
import { AdminAgent } from '@/server/modules/autonomous-agents/admin-agent'

const AGENT_CLASSES = [
  AssistantAgent,
  ResearcherAgent,
  WriterAgent,
  SweeperAgent,
  AdminAgent,
] as const

export interface RegisteredAgent {
  className: string
  displayName: string
  description: string
  /** User-facing "use this when…" — see AgentMetadata.userPurpose. */
  userPurpose?: string
  category: string
  icon?: string
}

/**
 * Returns the registered agent catalogue, filtered to classes that
 * declare static metadata. Classes without metadata are silently
 * skipped — UIs that consume this list get a clean catalogue;
 * unannotated classes still work, they just don't appear in pickers.
 */
export function listRegisteredAgents(): RegisteredAgent[] {
  const out: RegisteredAgent[] = []
  for (const cls of AGENT_CLASSES) {
    const meta = (cls as unknown as AgentClassWithMetadata).metadata
    const className = (cls as unknown as AgentClassWithMetadata).className
    if (!meta || !className) continue
    out.push({
      className,
      displayName: meta.displayName,
      description: meta.description,
      ...(meta.userPurpose ? { userPurpose: meta.userPurpose } : {}),
      category: meta.category,
      ...(meta.icon ? { icon: meta.icon } : {}),
    })
  }
  return out
}

/**
 * Lookup metadata for a single class name. Used by formatters that
 * translate `agent_runs.agent_class` (raw) → friendly display name.
 */
export function getAgentMetadata(className: string): RegisteredAgent | null {
  return listRegisteredAgents().find((a) => a.className === className) ?? null
}
