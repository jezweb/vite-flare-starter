/**
 * config-diff apply switch — the only place that knows how to turn an
 * approved proposal into a real mutation for each `kind`.
 *
 * Adding a new kind = add a case here + a matching `loadCurrent` entry.
 * Everything else (storage, UI, chat tool) is generic.
 */
import { uploadSkillToR2 } from '@/server/lib/ai/skills/registry'
import type {
  ConfigDiffProposal,
  ConfigDiffResource,
} from '@/shared/config/diff-proposal'

export interface ApplyEnv {
  DB: D1Database
  SKILLS?: R2Bucket
}

/**
 * Read the current live content for a resource — used when creating a
 * proposal so `before` reflects the actual current state, not whatever
 * the model or UI believes it to be.
 *
 * The user's personal override is preferred; falls back to bundled.
 */
export async function loadCurrentContent(
  env: ApplyEnv,
  resource: Pick<ConfigDiffResource, 'kind' | 'id'>,
  userId: string,
): Promise<string> {
  switch (resource.kind) {
    case 'skill': {
      const { loadSkill } = await import('@/server/lib/ai/skills/registry')
      const skill = await loadSkill(env, resource.id, userId)
      if (!skill) return ''
      // Rebuild the SKILL.md from its parsed form — matches what the
      // user will edit and what the diff should compare against.
      const fm = skill.frontmatter
      const fmLines: string[] = ['---']
      for (const [key, value] of Object.entries(fm)) {
        if (typeof value === 'string') {
          fmLines.push(`${key}: ${value}`)
        } else {
          fmLines.push(`${key}: ${JSON.stringify(value)}`)
        }
      }
      fmLines.push('---')
      return `${fmLines.join('\n')}\n\n${skill.body.trim()}\n`
    }
    case 'system-prompt':
    case 'setting':
    case 'connector-tool-policy':
      // Stubs — v1 ships with skill only; other kinds added on demand.
      return ''
  }
}

/**
 * Execute an approved proposal. Called by the routes layer AFTER the
 * proposal's status has been flipped to 'applied' — this function is
 * pure effect.
 */
export async function applyProposal(
  env: ApplyEnv,
  proposal: ConfigDiffProposal,
): Promise<void> {
  switch (proposal.resource.kind) {
    case 'skill': {
      if (!env.SKILLS) {
        throw new Error(
          'SKILLS R2 bucket not configured — cannot persist skill edits. Add the binding in wrangler.jsonc.',
        )
      }
      // uploadSkillToR2 writes to `${userId}/${name}/SKILL.md` and
      // upserts the skill row scoped to (userId, name). The bundled
      // row is never touched — user edits always create/update their
      // PERSONAL override.
      await uploadSkillToR2(env, proposal.after, proposal.userId, { overwrite: true })
      return
    }
    case 'system-prompt':
    case 'setting':
    case 'connector-tool-policy':
      throw new Error(
        `Apply handler for kind "${proposal.resource.kind}" not yet implemented.`,
      )
  }
}
