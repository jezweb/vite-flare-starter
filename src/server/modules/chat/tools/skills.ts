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
import { getSandbox } from '@cloudflare/sandbox'

interface SkillsContext {
  env: {
    DB: D1Database
    SKILLS?: R2Bucket
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SANDBOX?: any
  }
  /** Used for per-user sandbox container key when running scripts. */
  userId?: string
  /**
   * Pre-fetched catalog of available skill names — used to constrain the
   * `load_skill` / `read_skill_resource` name parameter to the valid set
   * so the model can't hallucinate names. Per agentskills.io client
   * implementation guide (Step 4). If empty or undefined, a free-form
   * string is accepted (fallback for callers that haven't listed yet).
   */
  availableSkillNames?: string[]
}

/**
 * Marker that wraps every load_skill / slash-command activation output.
 * Future context-compaction code should preserve messages containing this
 * marker. Per agentskills.io client-implementation guide, Step 5.
 */
export const SKILL_CONTENT_MARKER = '<skill_content'

/**
 * Per-request set of skill names that have already been injected into this
 * tool-loop. Used by load_skill to short-circuit repeat activations and
 * return a compact pointer rather than the full body again.
 *
 * Lives module-scope so that builds of buildSkillsTools within one request
 * share state; reset naturally across requests because each request creates
 * a fresh ToolSet via buildChatTools() / buildSkillsTools().
 *
 * NOTE: this dedup is intentionally conservative — the agent may explicitly
 * want to re-inject a skill if it believes the earlier activation got pruned.
 * We return enough info (directory + resources) that the agent can keep
 * working either way, but we flag `deduped: true` so a diagnostic logger or
 * tracer knows what happened.
 */
function createLoadedSkillsTracker(): Set<string> {
  return new Set<string>()
}

/** Map a script file extension to its interpreter command. Null = unsupported. */
function interpreterFor(path: string): { cmd: string; lang: string } | null {
  const ext = path.toLowerCase().split('.').pop() || ''
  if (ext === 'py') return { cmd: 'python3', lang: 'python' }
  if (ext === 'sh' || ext === 'bash') return { cmd: 'bash', lang: 'shell' }
  if (ext === 'js' || ext === 'mjs') return { cmd: 'node', lang: 'javascript' }
  return null
}

export function buildSkillsTools(ctx: SkillsContext) {
  // Build a Zod enum if we have a non-empty catalog; otherwise fall back to
  // a free-form string. Enum prevents the model from inventing skill names.
  const nameSchema = ctx.availableSkillNames && ctx.availableSkillNames.length > 0
    ? z.enum(ctx.availableSkillNames as [string, ...string[]])
    : z.string()

  // Dedup tracker — scoped to this toolset instance (one per request).
  const loadedSkills = createLoadedSkillsTracker()

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
      description: "Load the full instructions for a skill by name. Use when a task matches a skill's description from the catalog. Returns the skill body wrapped in <skill_content> tags, the skill directory (for resolving relative paths), and a list of sibling resources you can read on demand. If you've already loaded this skill earlier in the session, a compact pointer is returned instead — the body is still in context above.",
      inputSchema: z.object({
        name: nameSchema.describe('The skill name (e.g. "web-research", "morning-brief")'),
      }),
      execute: async ({ name }) => {
        try {
          const skill = await loadSkill(ctx.env, name)
          if (!skill) return { name, error: `Skill "${name}" not found` }

          // Session-level dedup per agentskills.io Step 5. If the same
          // skill has already been loaded in this tool-loop, return a short
          // pointer rather than re-injecting the full body — keeps context
          // lean and prevents the model from seeing duplicate instructions.
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
        name: nameSchema.describe('The skill name'),
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

    run_skill_script: tool({
      description: "Fetch a script file bundled with a skill and execute it in the sandbox in one call. Detects interpreter from file extension (.py → python, .sh/.bash → bash, .js/.mjs → node). Use when a skill's instructions point at a scripts/*.py or similar — avoids the read-then-run round trip. Optional stdin string for feeding data to the script. Args are not supported; write the script to read from stdin, env vars (from an env_json you pass), or a fixed config file path.",
      inputSchema: z.object({
        name: nameSchema.describe('The skill name'),
        path: z.string().describe('Relative resource path to the script, e.g. "scripts/extract.py"'),
        stdin: z.string().optional().describe('Optional stdin content (string) piped into the script'),
        timeout: z.number().optional().describe('Timeout in seconds (default: 60)'),
      }),
      execute: async ({ name, path, stdin, timeout = 60 }) => {
        try {
          if (!ctx.env.SANDBOX) {
            return { name, path, error: 'Cloudflare Sandbox not configured — SANDBOX binding missing. Use read_skill_resource + run_python/run_shell/run_js as a fallback.' }
          }
          const skill = await loadSkill(ctx.env, name)
          if (!skill) return { name, path, error: `Skill "${name}" not found` }
          if (!skill.resources.includes(path)) {
            return { name, path, error: `"${path}" is not a listed resource of skill "${name}". Available: ${skill.resources.join(', ') || '(none)'}` }
          }
          const interp = interpreterFor(path)
          if (!interp) {
            return { name, path, error: `Unsupported script extension on "${path}". Supported: .py, .sh, .bash, .js, .mjs.` }
          }
          const content = await skill.fetchResource(path)
          if (content === null) return { name, path, error: `Script "${path}" could not be loaded.` }

          // Per-user sandbox container; all inputs (name, path) are already
          // validated against a closed allowlist — nothing user-controlled
          // is interpolated into shell commands.
          const sandboxId = `user-${ctx.userId ?? 'anon'}`
          const sandbox = getSandbox(ctx.env.SANDBOX, sandboxId)

          // Python and JavaScript: feed content to runCode (no shell involved).
          // Prepend stdin as a sys.stdin-style pre-populated string where needed.
          if (interp.lang === 'python') {
            const preamble = stdin !== undefined
              ? `import io, sys\nsys.stdin = io.StringIO(${JSON.stringify(stdin)})\n`
              : ''
            const result = await sandbox.runCode(preamble + content, { language: 'python', timeout: timeout * 1000 })
            return {
              name, path, language: interp.lang,
              stdout: (result.logs?.stdout || []).join(''),
              stderr: (result.logs?.stderr || []).join(''),
              exitCode: result.error ? 1 : 0,
              error: result.error ? `${result.error.name}: ${result.error.message}` : undefined,
            }
          }
          if (interp.lang === 'javascript') {
            const preamble = stdin !== undefined
              ? `globalThis.__stdin = ${JSON.stringify(stdin)};\n`
              : ''
            const result = await sandbox.runCode(preamble + content, { language: 'javascript', timeout: timeout * 1000 })
            return {
              name, path, language: interp.lang,
              stdout: (result.logs?.stdout || []).join(''),
              stderr: (result.logs?.stderr || []).join(''),
              exitCode: result.error ? 1 : 0,
              error: result.error ? `${result.error.name}: ${result.error.message}` : undefined,
            }
          }

          // Shell scripts: writeFile the content to a deterministic path, then
          // invoke bash against that path. No user input ever becomes shell syntax.
          // stdin is passed via $SKILL_STDIN env var; scripts read with
          // `echo "$SKILL_STDIN"` rather than actual stdin. Keeps us off
          // shell-piping and out of `child_process.exec` shell-injection territory.
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
            name, path, language: interp.lang,
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            exitCode: result.exitCode ?? 0,
            success: result.success,
          }
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
