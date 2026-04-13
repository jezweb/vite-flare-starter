/**
 * Skills Tool — load skill content on demand
 *
 * The agent sees skill names + descriptions in its system prompt.
 * When it decides to use a skill, it calls load_skill to get the full body.
 *
 * Implements progressive disclosure (Claude Agent Skills pattern):
 *   Level 1: metadata always in system prompt
 *   Level 2: full SKILL.md loaded via this tool when triggered
 *   Level 3: skill can reference bundled files (read via fs_read tool)
 */
import { tool } from 'ai'
import { z } from 'zod'
import { loadSkill } from '@/server/lib/ai/skills/registry'

interface SkillsContext {
  env: { DB: D1Database; SKILLS?: R2Bucket }
}

export function buildSkillsTools(ctx: SkillsContext) {
  return {
    load_skill: tool({
      description: "Load the full instructions for a skill by name. Use when you need to follow a specific procedure that's been registered as a skill. The system prompt lists available skills with their descriptions — call this with the skill's name to get the detailed instructions.",
      inputSchema: z.object({
        name: z.string().describe('The skill name (e.g. "web-research", "morning-brief")'),
      }),
      execute: async ({ name }) => {
        try {
          const skill = await loadSkill(ctx.env, name)
          if (!skill) {
            return { name, error: `Skill "${name}" not found` }
          }
          return {
            name: skill.frontmatter.name,
            description: skill.frontmatter.description,
            instructions: skill.body,
            metadata: skill.frontmatter,
          }
        } catch (error) {
          return { name, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
