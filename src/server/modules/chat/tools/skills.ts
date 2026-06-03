/**
 * Skills Tools — list, load, create, and manage skills.
 *
 * The agent sees skill metadata in its system prompt (Level 1).
 * These tools provide full skill lifecycle management:
 * - list: browse available skills with descriptions
 * - load: get full SKILL.md body (Level 2 disclosure)
 * - read/run: access skill resources + scripts
 * - create: write a new skill to R2
 * - install: add a skill from a GitHub URL
 * - toggle: enable/disable a skill
 *
 * Because the `load_skill` name field is a Zod enum of the session's
 * available skills, this file exports a FACTORY (`skillsDefinitions(names)`)
 * rather than a static array — the schema has to be rebuilt per request.
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { getSandbox } from '@cloudflare/sandbox'
import {
  BookOpen,
  List,
  FileSearch,
  Terminal,
  PlusSquare,
  Download,
  ToggleRight,
} from 'lucide-react'
import {
  listSkills,
  loadSkill,
  addGitHubSkill,
  uploadSkillToR2,
} from '@/server/lib/ai/skills/registry'
import { skills } from '@/server/modules/skills/db/schema'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

type SkillsEnv = {
  DB: D1Database
  SKILLS?: R2Bucket
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SANDBOX?: any
}

function getSkillsEnv(ctx: AgentContext): SkillsEnv {
  return ctx.env as unknown as SkillsEnv
}

/**
 * Marker that wraps every load_skill / slash-command activation output.
 * Future context-compaction code should preserve messages containing this.
 */
export const SKILL_CONTENT_MARKER = '<skill_content'

function interpreterFor(path: string): { cmd: string; lang: string } | null {
  const ext = path.toLowerCase().split('.').pop() || ''
  if (ext === 'py') return { cmd: 'python3', lang: 'python' }
  if (ext === 'sh' || ext === 'bash') return { cmd: 'bash', lang: 'shell' }
  if (ext === 'js' || ext === 'mjs') return { cmd: 'node', lang: 'javascript' }
  return null
}

/**
 * Per-request factory. `availableSkillNames` constrains the `name` field of
 * load/read/run tools to a Zod enum — prevents the model hallucinating
 * skill names. If empty, falls back to a free-form string.
 */
export function skillsDefinitions(
  availableSkillNames: string[] = []
): ToolDefinition<unknown, unknown>[] {
  const nameSchema =
    availableSkillNames.length > 0
      ? z.enum(availableSkillNames as [string, ...string[]])
      : z.string()

  // Dedup tracker scoped to this factory invocation (one per request).
  const loadedSkills = new Set<string>()

  const SkillSummarySchema = z.object({
    name: z.string(),
    description: z.string(),
    source: z.enum(['bundled', 'r2', 'github']),
    disableModelInvocation: z.boolean().optional(),
  })

  const ListSkillsOutput = z.union([
    z.object({ skills: z.array(SkillSummarySchema), count: z.number() }),
    z.object({ error: z.string() }),
  ])

  const listSkillsDef: ToolDefinition<Record<string, never>, z.infer<typeof ListSkillsOutput>> = {
    name: 'list_skills',
    description:
      'List all available skills with their names, descriptions, and sources. Use to discover what skills exist before loading one, or to help the user understand available capabilities.',
    inputSchema: z.object({}),
    outputSchema: ListSkillsOutput,
    execute: async (_input, ctx) => {
      try {
        const items = await listSkills(getSkillsEnv(ctx), ctx.userId)
        return { skills: items, count: items.length }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
    },
    render: { icon: List, displayName: 'List Skills' },
  }

  const LoadSkillOutput = z.union([
    z.object({
      name: z.string(),
      description: z.string(),
      directory: z.string(),
      resources: z.array(z.string()),
      deduped: z.literal(true),
      note: z.string(),
    }),
    z.object({
      name: z.string(),
      description: z.string(),
      directory: z.string(),
      resources: z.array(z.string()),
      content: z.string(),
      frontmatter: z.record(z.string(), z.unknown()),
      warnings: z.array(z.string()).optional(),
    }),
    z.object({ name: z.string(), error: z.string() }),
  ])

  const loadSkillDef: ToolDefinition<{ name: string }, z.infer<typeof LoadSkillOutput>> = {
    name: 'load_skill',
    description:
      "Load the full instructions for a skill by name. Use when a task matches a skill's description from the catalog. Returns the skill body wrapped in <skill_content> tags, the skill directory (for resolving relative paths), and a list of sibling resources you can read on demand. If you've already loaded this skill earlier in the session, a compact pointer is returned instead — the body is still in context above.",
    inputSchema: z.object({
      name: nameSchema.describe('The skill name (e.g. "web-research", "morning-brief")'),
    }),
    outputSchema: LoadSkillOutput,
    execute: async ({ name }, ctx) => {
      try {
        const skill = await loadSkill(getSkillsEnv(ctx), name, ctx.userId)
        if (!skill) return { name, error: `Skill "${name}" not found` }

        if (loadedSkills.has(name)) {
          return {
            name: skill.name,
            description: skill.frontmatter.description,
            directory: skill.directory,
            resources: skill.resources,
            deduped: true,
            note: `Skill "${name}" was already loaded earlier in this conversation — the body is above. Use read_skill_resource / run_skill_script for its resources.`,
          }
        }
        loadedSkills.add(name)

        const resourceBlock =
          skill.resources.length > 0
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
        ]
          .filter(Boolean)
          .join('\n')

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
    render: { icon: BookOpen, displayName: 'Load Skill' },
  }

  const ReadSkillResourceOutput = z.union([
    z.object({ name: z.string(), path: z.string(), content: z.string() }),
    z.object({ name: z.string(), path: z.string(), error: z.string() }),
  ])

  const readSkillResourceDef: ToolDefinition<
    { name: string; path: string },
    z.infer<typeof ReadSkillResourceOutput>
  > = {
    name: 'read_skill_resource',
    description:
      "Read a resource file (script, reference, asset) bundled with a skill. The skill's load_skill result lists available resources under <skill_resources>. Use this to pull a specific file's content — do NOT eagerly read everything listed.",
    inputSchema: z.object({
      name: nameSchema.describe('The skill name'),
      path: z
        .string()
        .describe(
          'The resource path relative to the skill directory, e.g. "scripts/extract.py" or "references/spec.md"'
        ),
    }),
    outputSchema: ReadSkillResourceOutput,
    execute: async ({ name, path }, ctx) => {
      try {
        const skill = await loadSkill(getSkillsEnv(ctx), name, ctx.userId)
        if (!skill) return { name, path, error: `Skill "${name}" not found` }
        if (!skill.resources.includes(path)) {
          return {
            name,
            path,
            error: `"${path}" is not a listed resource of skill "${name}". Available: ${skill.resources.join(', ') || '(none)'}`,
          }
        }
        const content = await skill.fetchResource(path)
        if (content === null)
          return { name, path, error: `Resource "${path}" could not be loaded.` }
        return { name, path, content }
      } catch (error) {
        return { name, path, error: error instanceof Error ? error.message : String(error) }
      }
    },
    render: { icon: FileSearch, displayName: 'Read Skill Resource' },
  }

  const RunSkillScriptOutput = z.union([
    z.object({
      name: z.string(),
      path: z.string(),
      language: z.string(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
      error: z.string().optional(),
      success: z.boolean().optional(),
    }),
    z.object({ name: z.string(), path: z.string(), error: z.string() }),
  ])

  const runSkillScriptDef: ToolDefinition<
    { name: string; path: string; stdin?: string; timeout?: number },
    z.infer<typeof RunSkillScriptOutput>
  > = {
    name: 'run_skill_script',
    description:
      "Fetch a script file bundled with a skill and execute it in the sandbox in one call. Detects interpreter from file extension (.py → python, .sh/.bash → bash, .js/.mjs → node). Use when a skill's instructions point at a scripts/*.py or similar — avoids the read-then-run round trip. Optional stdin string for feeding data to the script.",
    inputSchema: z.object({
      name: nameSchema.describe('The skill name'),
      path: z.string().describe('Relative resource path to the script, e.g. "scripts/extract.py"'),
      stdin: z
        .string()
        .optional()
        .describe('Optional stdin content (string) piped into the script'),
      timeout: z.number().optional().describe('Timeout in seconds (default: 60)'),
    }),
    outputSchema: RunSkillScriptOutput,
    execute: async ({ name, path, stdin, timeout = 60 }, ctx) => {
      try {
        const env = getSkillsEnv(ctx)
        if (!env.SANDBOX) {
          return {
            name,
            path,
            error:
              'Cloudflare Sandbox not configured — SANDBOX binding missing. Use read_skill_resource + run_python/run_shell/run_js as a fallback.',
          }
        }
        const skill = await loadSkill(env, name, ctx.userId)
        if (!skill) return { name, path, error: `Skill "${name}" not found` }
        if (!skill.resources.includes(path)) {
          return {
            name,
            path,
            error: `"${path}" is not a listed resource of skill "${name}". Available: ${skill.resources.join(', ') || '(none)'}`,
          }
        }
        const interp = interpreterFor(path)
        if (!interp) {
          return {
            name,
            path,
            error: `Unsupported script extension on "${path}". Supported: .py, .sh, .bash, .js, .mjs.`,
          }
        }
        const content = await skill.fetchResource(path)
        if (content === null) return { name, path, error: `Script "${path}" could not be loaded.` }

        const sandboxId = `user-${ctx.userId}`
        const sandbox = getSandbox(env.SANDBOX, sandboxId)

        if (interp.lang === 'python') {
          const preamble =
            stdin !== undefined
              ? `import io, sys\nsys.stdin = io.StringIO(${JSON.stringify(stdin)})\n`
              : ''
          const result = await sandbox.runCode(preamble + content, {
            language: 'python',
            timeout: timeout * 1000,
          })
          return {
            name,
            path,
            language: interp.lang,
            stdout: (result.logs?.stdout || []).join(''),
            stderr: (result.logs?.stderr || []).join(''),
            exitCode: result.error ? 1 : 0,
            error: result.error ? `${result.error.name}: ${result.error.message}` : undefined,
          }
        }
        if (interp.lang === 'javascript') {
          const preamble =
            stdin !== undefined ? `globalThis.__stdin = ${JSON.stringify(stdin)};\n` : ''
          const result = await sandbox.runCode(preamble + content, {
            language: 'javascript',
            timeout: timeout * 1000,
          })
          return {
            name,
            path,
            language: interp.lang,
            stdout: (result.logs?.stdout || []).join(''),
            stderr: (result.logs?.stderr || []).join(''),
            exitCode: result.error ? 1 : 0,
            error: result.error ? `${result.error.name}: ${result.error.message}` : undefined,
          }
        }

        const workPath = `/workspace/.skills/${name}__${path.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        await sandbox.exec(`mkdir -p /workspace/.skills`, { timeout: 5000 })
        await sandbox.writeFile(workPath, content)
        const execEnv: Record<string, string> = {}
        if (stdin !== undefined) execEnv['SKILL_STDIN'] = stdin
        const result = await sandbox.exec(`bash ${workPath}`, {
          timeout: timeout * 1000,
          ...(stdin !== undefined ? { env: execEnv } : {}),
        })
        return {
          name,
          path,
          language: interp.lang,
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          exitCode: result.exitCode ?? 0,
          success: result.success,
        }
      } catch (error) {
        return { name, path, error: error instanceof Error ? error.message : String(error) }
      }
    },
    render: { icon: Terminal, displayName: 'Run Skill Script' },
  }

  const CreateSkillOutput = z.union([
    z.object({
      name: z.string(),
      description: z.string(),
      path: z.string(),
      action: z.string(),
    }),
    z.object({ error: z.string() }),
  ])

  const createSkillDef: ToolDefinition<
    { content: string; overwrite?: boolean },
    z.infer<typeof CreateSkillOutput>
  > = {
    name: 'create_skill',
    description:
      "Create a new skill from a SKILL.md document. The skill will be stored in R2 and available immediately. Use when you've developed a useful procedure that should be reusable. Requires the full SKILL.md content with YAML frontmatter (name + description) and markdown body.",
    inputSchema: z.object({
      content: z
        .string()
        .describe(
          'Full SKILL.md content including YAML frontmatter (---\\nname: ...\\ndescription: ...\\n---) and markdown body'
        ),
      overwrite: z
        .boolean()
        .optional()
        .describe('Overwrite if a skill with this name already exists (default: false)'),
    }),
    outputSchema: CreateSkillOutput,
    needsApproval: true,
    execute: async ({ content, overwrite }, ctx) => {
      try {
        const result = await uploadSkillToR2(getSkillsEnv(ctx), content, ctx.userId, { overwrite })
        return { ...result, action: overwrite ? 'updated' : 'created' }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
    },
    render: { icon: PlusSquare, displayName: 'Create Skill' },
  }

  const InstallSkillOutput = z.union([
    z.object({
      name: z.string(),
      description: z.string(),
      source: z.literal('github'),
      action: z.literal('installed'),
    }),
    z.object({ error: z.string() }),
  ])

  const installSkillDef: ToolDefinition<{ url: string }, z.infer<typeof InstallSkillOutput>> = {
    name: 'install_skill',
    description:
      'Install a skill from a GitHub URL. Fetches the SKILL.md, registers it, and caches it in R2. Use to add community skills or skills from the Anthropic skills repo.',
    inputSchema: z.object({
      url: z
        .string()
        .describe(
          'Raw GitHub URL to the SKILL.md file (e.g. https://raw.githubusercontent.com/anthropics/skills/main/pdf/SKILL.md)'
        ),
    }),
    outputSchema: InstallSkillOutput,
    needsApproval: true,
    execute: async ({ url }, ctx) => {
      try {
        const result = await addGitHubSkill(getSkillsEnv(ctx), url)
        return { ...result, source: 'github', action: 'installed' }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
    },
    render: { icon: Download, displayName: 'Install Skill' },
  }

  const ToggleSkillOutput = z.union([
    z.object({ name: z.string(), enabled: z.boolean(), action: z.string() }),
    z.object({ error: z.string() }),
  ])

  const toggleSkillDef: ToolDefinition<
    { name: string; enabled: boolean },
    z.infer<typeof ToggleSkillOutput>
  > = {
    name: 'toggle_skill',
    description:
      'Enable or disable a skill. Disabled skills are hidden from the system prompt but their code remains available. Use to temporarily turn off a skill without deleting it.',
    inputSchema: z.object({
      name: z.string().describe('The skill name to enable/disable'),
      enabled: z.boolean().describe('true to enable, false to disable'),
    }),
    outputSchema: ToggleSkillOutput,
    execute: async ({ name, enabled }, ctx) => {
      try {
        const db = drizzle(getSkillsEnv(ctx).DB)
        // Scope the toggle to the user's own row — they can only
        // enable/disable their personal override, not the bundled default.
        await db
          .update(skills)
          .set({ enabled, updatedAt: new Date() })
          .where(and(eq(skills.userId, ctx.userId), eq(skills.name, name)))
        return { name, enabled, action: enabled ? 'enabled' : 'disabled' }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
    },
    render: { icon: ToggleRight, displayName: 'Toggle Skill' },
  }

  return [
    listSkillsDef,
    loadSkillDef,
    readSkillResourceDef,
    runSkillScriptDef,
    createSkillDef,
    installSkillDef,
    toggleSkillDef,
  ] as ToolDefinition<unknown, unknown>[]
}
