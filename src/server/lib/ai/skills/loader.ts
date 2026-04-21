/**
 * SKILL.md Parser
 *
 * Parses the Agent Skills format per agentskills.io: YAML frontmatter +
 * markdown body. Compatible with Claude Code, OpenAI Codex CLI, Copilot,
 * Cursor, Gemini CLI, Cline, and other agentskills.io clients.
 *
 * Parsing is lenient: unknown frontmatter fields are preserved, invalid
 * names warn rather than throw, and a fallback handles the common
 * unquoted-colon case in descriptions.
 *
 * @see https://agentskills.io/specification
 * @see https://agentskills.io/client-implementation/adding-skills-support
 */

export interface SkillFrontmatter {
  name: string
  description: string
  /** Extended trigger guidance, appended to description by some clients (Claude Code). */
  when_to_use?: string
  /** Tool allowlist — array of tool names the skill expects to use. */
  allowed_tools?: string[]
  /** Glob patterns that limit auto-activation to matching file paths. */
  paths?: string[]
  /** Environment / runtime compatibility notes. */
  compatibility?: string
  /** If true, skill is user-invocable only; the model should NOT auto-load it. */
  disable_model_invocation?: boolean
  /** If false, skill is hidden from user slash-command UI. */
  user_invocable?: boolean
  /** Any other frontmatter fields — preserved for round-trip. */
  [key: string]: unknown
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter
  body: string
  raw: string
  /** Non-fatal diagnostics (e.g. name mismatch) to surface to the user. */
  warnings: string[]
}

/**
 * Minimal YAML parser for skill frontmatter.
 * Supports: string values, arrays of strings, simple key: value pairs.
 * Multi-line strings, nested objects, and complex YAML are not supported
 * (skills don't need them).
 */
function parseFrontmatter(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yaml.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (!line || line.startsWith('#')) continue

    // Match "key: value" or "key:" (start of array/block)
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/)
    if (!match) continue

    const [, key, value] = match
    if (!key) continue

    // Quoted string
    if (value && /^["'].*["']$/.test(value)) {
      result[key] = value.slice(1, -1)
      continue
    }

    // Inline array: [a, b, c]
    if (value && value.startsWith('[') && value.endsWith(']')) {
      result[key] = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
      continue
    }

    // Block array (next lines start with "- ")
    if (!value && i + 1 < lines.length && lines[i + 1]?.trim().startsWith('- ')) {
      const items: string[] = []
      while (i + 1 < lines.length && lines[i + 1]?.trim().startsWith('- ')) {
        i++
        const item = lines[i]?.trim().slice(2).trim().replace(/^["']|["']$/g, '')
        if (item) items.push(item)
      }
      result[key] = items
      continue
    }

    // Plain string value
    if (value) {
      result[key] = value.trim()
    }
  }

  return result
}

/**
 * Normalise Claude Code-style kebab frontmatter keys to snake_case so the
 * same skill works whether it was authored with `allowed-tools` or
 * `allowed_tools`.
 */
function normaliseKey(key: string): string {
  return key.replace(/-/g, '_')
}

/**
 * Pre-process YAML to fix the common unquoted-colon case in descriptions,
 * per the client-implementation guide. A value that starts with a bare word
 * and contains `:` gets wrapped in quotes before reparsing.
 */
function fixUnquotedColons(yaml: string): string {
  return yaml
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\s*[a-zA-Z_][a-zA-Z0-9_-]*:)\s*(.*)$/)
      if (!m) return line
      const [, prefix = '', value = ''] = m
      // Already quoted / empty / inline array — leave alone
      if (!value || /^["'\[]/.test(value) || !value.includes(':')) return line
      const escaped = value.replace(/"/g, '\\"')
      return `${prefix} "${escaped}"`
    })
    .join('\n')
}

/**
 * Parse a SKILL.md file leniently.
 *
 * Skips the skill (throws) only when the frontmatter is completely
 * unparseable or missing the bare-minimum `description` field. Other
 * issues (name-vs-directory mismatch, name too long, description too
 * long) are recorded as warnings rather than fatal errors — matches the
 * agentskills.io client-implementation guidance.
 */
export function parseSkill(content: string, opts: { expectedName?: string } = {}): ParsedSkill {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    throw new Error('SKILL.md must start with YAML frontmatter delimited by ---')
  }

  const [, yaml = '', body = ''] = match

  // First-pass parse; on failure retry with the unquoted-colon fallback
  let fmRaw = parseFrontmatter(yaml)
  if (!fmRaw['description'] || !fmRaw['name']) {
    fmRaw = parseFrontmatter(fixUnquotedColons(yaml))
  }

  // Normalise kebab-case keys to snake_case so both variants resolve
  const fm: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fmRaw)) {
    fm[normaliseKey(k)] = v
  }

  const warnings: string[] = []

  if (typeof fm['description'] !== 'string' || !fm['description']) {
    throw new Error('SKILL.md frontmatter missing required field: description')
  }
  if (typeof fm['name'] !== 'string' || !fm['name']) {
    throw new Error('SKILL.md frontmatter missing required field: name')
  }

  if (!/^[a-z0-9-]+$/.test(fm['name'])) {
    warnings.push(`Skill name "${fm['name']}" contains characters outside a-z0-9-; some clients may reject it.`)
  }
  if (fm['name'].length > 64) {
    warnings.push(`Skill name "${fm['name']}" exceeds 64 characters.`)
  }
  if (opts.expectedName && fm['name'] !== opts.expectedName) {
    warnings.push(`Skill name "${fm['name']}" does not match parent directory "${opts.expectedName}".`)
  }
  if ((fm['description'] as string).length > 1024) {
    warnings.push(`Skill description exceeds 1024 characters (${(fm['description'] as string).length}).`)
  }

  return {
    frontmatter: fm as SkillFrontmatter,
    body: body.trim(),
    raw: content,
    warnings,
  }
}
