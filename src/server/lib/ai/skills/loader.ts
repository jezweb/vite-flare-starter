/**
 * SKILL.md Parser
 *
 * Parses Claude Agent Skills format: YAML frontmatter + markdown body.
 * Compatible with Claude Code, Codex, Hermes, OpenClaw, and others.
 *
 * @see https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
 */

export interface SkillFrontmatter {
  name: string
  description: string
  [key: string]: unknown
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter
  body: string
  raw: string
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
 * Parse a SKILL.md file.
 *
 * Throws if frontmatter is missing or required fields (name, description) are absent.
 */
export function parseSkill(content: string): ParsedSkill {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    throw new Error('SKILL.md must start with YAML frontmatter delimited by ---')
  }

  const [, yaml = '', body = ''] = match
  const fm = parseFrontmatter(yaml)

  if (typeof fm['name'] !== 'string' || !fm['name']) {
    throw new Error('SKILL.md frontmatter missing required field: name')
  }
  if (typeof fm['description'] !== 'string' || !fm['description']) {
    throw new Error('SKILL.md frontmatter missing required field: description')
  }

  // Validate name format (Claude spec: lowercase, numbers, hyphens, max 64 chars)
  if (!/^[a-z0-9-]{1,64}$/.test(fm['name'])) {
    throw new Error(`Invalid skill name "${fm['name']}": must be lowercase letters, numbers, hyphens, max 64 chars`)
  }
  if (fm['description'].length > 1024) {
    throw new Error(`Skill description too long (${fm['description'].length} chars, max 1024)`)
  }

  return {
    frontmatter: fm as SkillFrontmatter,
    body: body.trim(),
    raw: content,
  }
}
