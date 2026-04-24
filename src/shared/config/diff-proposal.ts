/**
 * ConfigDiffProposal — shared contract for staged user-configurable changes.
 *
 * Any server action that mutates user-scoped config (skill body, system
 * prompts, feature flags, connector tool toggles, …) can produce a
 * proposal instead of applying directly. The user reviews a diff, then
 * approves or rejects via the shared `ConfigDiffCard` React component.
 *
 * Two producers:
 *  1. The Skills editor UI — user edits, clicks Save → proposal.
 *  2. The chat agent's `propose_patch` tool — AI wants to change
 *     something → proposal renders inline in chat → user approves.
 *
 * The `before` snapshot is captured server-side at proposal creation
 * time so the diff reflects the true live state, not the model's
 * (possibly stale) idea of current content.
 */

export type ConfigDiffKind =
  | 'skill'
  | 'system-prompt'
  | 'setting'
  | 'connector-tool-policy'

export type ConfigDiffFormat = 'markdown' | 'json' | 'yaml' | 'plain'

export type ConfigDiffStatus = 'pending' | 'applied' | 'rejected'

export interface ConfigDiffResource {
  kind: ConfigDiffKind
  /** Stable identifier within the kind — e.g. skill name, setting key. */
  id: string
  /** Human label for the diff card header. */
  label: string
}

export interface ConfigDiffCreator {
  type: 'user' | 'agent' | 'ai-sparkle'
  userId: string
  /** Optional model id when `type` is 'agent' or 'ai-sparkle'. */
  modelId?: string
}

export interface ConfigDiffProposal {
  id: string
  userId: string
  resource: ConfigDiffResource
  before: string
  after: string
  /** Short one-sentence reason shown prominently on the card. */
  summary: string
  /** Optional longer rationale (markdown rendered). */
  reason?: string | null
  format: ConfigDiffFormat
  createdBy: ConfigDiffCreator
  createdAt: number
  status: ConfigDiffStatus
  /** When status !== 'pending'. */
  resolvedAt?: number | null
}

export interface CreateProposalInput {
  resource: ConfigDiffResource
  before: string
  after: string
  summary: string
  reason?: string | null
  format?: ConfigDiffFormat
  createdBy: ConfigDiffCreator
}
