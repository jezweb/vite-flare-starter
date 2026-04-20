/**
 * Skills Tools — list, load, create, and manage skills
 *
 * The agent sees skill metadata in its system prompt (Level 1).
 * These tools provide full skill lifecycle management:
 * - list: browse available skills with descriptions
 * - load: get full SKILL.md body (Level 2 disclosure)
 * - create: write a new skill to R2 (or suggest for bundling)
 * - install: add a skill from a GitHub URL
 * - toggle: enable/disable a skill
 */
import { tool } from 'ai'
import { z } from 'zod'
import {
  listSkills,
  loadSkill,
  addGitHubSkill,
  uploadSkillToR2,
} from '@/server/lib/ai/skills/registry'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { skills } from '@/server/modules/skills/db/schema'

interface SkillsContext {
  env: { DB: D1Database; SKILLS?: R2Bucket }
}

export function buildSkillsTools(ctx: SkillsContext) {
  return {
    list_skills: tool({
      description: 'List all available skills with their names, descriptions, and sources. Use to discover what skills exist before loading one, or to help the user understand available capabilities.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const items = await listSkills(ctx.env)
          return { skills: items, count: items.length }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    load_skill: tool({
      description: "Load the full instructions for a skill by name. Use when a task matches a skill's description from the catalog. Returns the skill body wrapped in <skill_content> tags, the skill directory (for resolving relative paths), and a list of sibling resources you can read on demand.",
      inputSchema: z.object({
        name: z.string().describe('The skill name (e.g. "web-research", "morning-brief")'),
      }),
      execute: async ({ name }) => {
        try {
          const skill = await loadSkill(ctx.env, name)
          if (!skill) return { name, error: `Skill "${name}" not found` }

          // Structured wrapping per agentskills.io client-implementation guide:
          // the agent sees a self-describing block it can distinguish from
          // other tool outputs, and a resource listing it can load on demand.
          const resourceBlock = skill.resources.length > 0
            ? `\n\n<skill_resources>\n${skill.resources.map((r) => `  <file>${r}</file>`).join('\n')}\n</skill_resources>`
            : ''
          const content = [
            `<skill_content name="${skill.name}" directory="${skill.directory}">`,
            skill.body,
            '',
            `Skill directory: ${skill.directory}`,
            'Relative paths in this skill resolve against the skill directory. Use the read_skill_resource tool (with the same skill name and the relative path) to load any listed resource on demand.',
            resourceBlock ? resourceBlock.trim() : '',
            '</skill_content>',
          ].filter(Boolean).join('\n')

          return {
            name: skill.name,
            description: skill.frontmatter.description,
            directory: skill.directory,
            resources: skill.resources,
            content,
            frontmatter: skill.frontmatter,
            warnings: skill.warnings,
          }
        } catch (error) {
          return { name, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    read_skill_resource: tool({
      description: "Read a resource file (script, reference, asset) bundled with a skill. The skill's load_skill result lists available resources under <skill_resources>. Use this to pull a specific file's content — do NOT eagerly read everything listed.",
      inputSchema: z.object({
        name: z.string().describe('The skill name'),
        path: z.string().describe('The resource path relative to the skill directory, e.g. "scripts/extract.py" or "references/spec.md"'),
      }),
      execute: async ({ name, path }) => {
        try {
          const skill = await loadSkill(ctx.env, name)
          if (!skill) return { name, path, error: `Skill "${name}" not found` }
          if (!skill.resources.includes(path)) {
            return {
              name,
              path,
              error: `"${path}" is not a listed resource of skill "${name}". Available: ${skill.resources.join(', ') || '(none)'}`,
            }
          }
          const content = await skill.fetchResource(path)
          if (content === null) {
            return { name, path, error: `Resource "${path}" could not be loaded.` }
          }
          return { name, path, content }
        } catch (error) {
          return { name, path, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    create_skill: tool({
      description: 'Create a new skill from a SKILL.md document. The skill will be stored in R2 and available immediately. Use when you\'ve developed a useful procedure that should be reusable. Requires the full SKILL.md content with YAML frontmatter (name + description) and markdown body.',
      inputSchema: z.object({
        content: z.string().describe('Full SKILL.md content including YAML frontmatter (---\\nname: ...\\ndescription: ...\\n---) and markdown body'),
        overwrite: z.boolean().optional().describe('Overwrite if a skill with this name already exists (default: false)'),
      }),
      execute: async ({ content, overwrite }) => {
        try {
          const result = await uploadSkillToR2(ctx.env, content, { overwrite })
          return { ...result, action: overwrite ? 'updated' : 'created' }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    install_skill: tool({
      description: 'Install a skill from a GitHub URL. Fetches the SKILL.md, registers it, and caches it in R2. Use to add community skills or skills from the Anthropic skills repo.',
      inputSchema: z.object({
        url: z.string().describe('Raw GitHub URL to the SKILL.md file (e.g. https://raw.githubusercontent.com/anthropics/skills/main/pdf/SKILL.md)'),
      }),
      execute: async ({ url }) => {
        try {
          const result = await addGitHubSkill(ctx.env, url)
          return { ...result, source: 'github', action: 'installed' }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    toggle_skill: tool({
      description: 'Enable or disable a skill. Disabled skills are hidden from the system prompt but their code remains available. Use to temporarily turn off a skill without deleting it.',
      inputSchema: z.object({
        name: z.string().describe('The skill name to enable/disable'),
        enabled: z.boolean().describe('true to enable, false to disable'),
      }),
      execute: async ({ name, enabled }) => {
        try {
          const db = drizzle(ctx.env.DB)
          await db.update(skills).set({ enabled, updatedAt: new Date() }).where(eq(skills.name, name))
          return { name, enabled, action: enabled ? 'enabled' : 'disabled' }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
