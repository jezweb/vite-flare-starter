/**
 * propose_patch — chat tool for the agent to stage a config change.
 *
 * The agent never mutates user config directly. It calls this tool with
 * the full `after` content and a one-sentence summary. The server looks
 * up `before` from the live state (via config-diff/apply.ts) and stores
 * a ConfigDiffProposal (status: pending). The client renderer inline
 * shows the proposal as an approval card; user clicks Approve → the
 * config-diff API applies it.
 *
 * Deliberately only supports the kinds that have apply handlers today.
 * Add new kinds in config-diff/apply.ts first, then widen the enum here.
 */
import { z } from 'zod'
import { FileDiff } from 'lucide-react'
import type { ToolDefinition } from '@/shared/agent'
import { createProposal } from '@/server/modules/config-diff/storage'
import { loadCurrentContent } from '@/server/modules/config-diff/apply'

const ProposePatchInput = z.object({
  kind: z
    .enum(['skill'])
    .describe('The kind of resource to edit. Only "skill" is supported today.'),
  id: z
    .string()
    .min(1)
    .describe(
      'Stable identifier for the resource. For skill: the skill name (without the leading slash).'
    ),
  label: z
    .string()
    .optional()
    .describe('Optional human-friendly label shown on the diff card. Defaults to the id.'),
  after: z
    .string()
    .describe(
      'Full new content of the resource. For skill: the complete SKILL.md (frontmatter + body). Do not wrap in code fences.'
    ),
  summary: z
    .string()
    .min(1)
    .max(300)
    .describe('One-sentence description of what this change does.'),
  reason: z
    .string()
    .optional()
    .nullable()
    .describe(
      'Longer rationale (markdown supported). Shown in the rationale section of the diff card.'
    ),
})

const ProposePatchOutput = z.object({
  proposalId: z.string(),
  status: z.literal('pending'),
  resourceKind: z.string(),
  resourceId: z.string(),
  summary: z.string(),
})

export const proposePatchDefinition: ToolDefinition<
  z.infer<typeof ProposePatchInput>,
  z.infer<typeof ProposePatchOutput>
> = {
  name: 'propose_patch',
  description:
    'Propose a change to a user-configurable resource (skill, etc.). The proposal is stored as pending — the user will see a diff and must approve before anything is applied. Use this when the user asks you to edit their skill, or when you want to suggest an improvement to one of their configurable files.',
  inputSchema: ProposePatchInput,
  outputSchema: ProposePatchOutput,
  needsApproval: false, // the proposal itself isn't the action — the user's Approve click is
  execute: async (input, ctx) => {
    const env = ctx.env as unknown as { DB: D1Database; SKILLS?: R2Bucket }
    const before = await loadCurrentContent(
      env,
      {
        kind: input.kind,
        id: input.id,
      },
      ctx.userId
    )
    if (!before) {
      throw new Error(
        `No current content found for ${input.kind} "${input.id}". Check the resource exists before proposing a patch.`
      )
    }
    if (before === input.after) {
      throw new Error(
        'The proposed `after` is identical to the current content — no change to review.'
      )
    }
    const proposal = await createProposal(env.DB, ctx.userId, {
      resource: {
        kind: input.kind,
        id: input.id,
        label: input.label ?? `/${input.id}`,
      },
      before,
      after: input.after,
      summary: input.summary,
      reason: input.reason ?? null,
      format: 'markdown',
      createdBy: {
        type: 'agent',
        userId: ctx.userId,
        modelId: ctx.model.id,
      },
    })
    return {
      proposalId: proposal.id,
      status: 'pending' as const,
      resourceKind: proposal.resource.kind,
      resourceId: proposal.resource.id,
      summary: proposal.summary,
    }
  },
  render: {
    icon: FileDiff,
    displayName: 'Propose change',
    summary: (output) => `${output.resourceKind}: ${output.resourceId}`,
  },
}

export const proposePatchDefinitions = [proposePatchDefinition] as ToolDefinition<
  unknown,
  unknown
>[]
