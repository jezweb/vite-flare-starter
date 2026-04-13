/**
 * Bundled Skills Loader
 *
 * Loads SKILL.md files shipped with the starter from /skills directory.
 * Uses Vite's import.meta.glob with `query: '?raw'` to bundle the markdown
 * content at build time — works in Workers without filesystem access.
 *
 * To add a bundled skill: drop a SKILL.md file at /skills/<name>/SKILL.md
 */
import { parseSkill, type SkillFrontmatter } from './loader'

// Vite glob import: bundles all SKILL.md files at build time.
// Relative path from src/server/lib/ai/skills/ to <project>/skills/
const skillModules = import.meta.glob<string>('../../../../../skills/*/SKILL.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export interface BundledSkill {
  name: string
  description: string
  path: string
  frontmatter: SkillFrontmatter
  body: string
}

let cached: BundledSkill[] | null = null

/** List all bundled skills with metadata (parsed). */
export async function listBundledSkills(): Promise<BundledSkill[]> {
  if (cached) return cached

  const result: BundledSkill[] = []
  for (const [path, content] of Object.entries(skillModules)) {
    if (typeof content !== 'string') continue
    try {
      const parsed = parseSkill(content)
      result.push({
        name: parsed.frontmatter.name,
        description: parsed.frontmatter.description,
        path,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
      })
    } catch (error) {
      console.error(`Failed to parse bundled skill at ${path}:`, error)
    }
  }
  cached = result
  return result
}

/** Get the raw content of a specific bundled skill by path. */
export async function getBundledSkill(path: string): Promise<string> {
  const content = skillModules[path]
  if (typeof content !== 'string') {
    throw new Error(`Bundled skill not found: ${path}`)
  }
  return content
}
