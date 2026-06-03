/**
 * Bundled Skills Loader
 *
 * Loads skill directories shipped with the starter from /skills. Each
 * skill lives at /skills/<name>/ with a SKILL.md plus optional
 * scripts/ and references/ subdirectories per the agentskills.io spec.
 *
 * Vite's import.meta.glob bundles the content at build time so this
 * works in Workers without filesystem access. SKILL.md contents are
 * loaded as raw text; sibling file paths are enumerated for on-demand
 * loading via the fs tools.
 *
 * To add a bundled skill: drop a directory at /skills/<name>/SKILL.md.
 * Supporting files in <name>/scripts/ and <name>/references/ are
 * discovered automatically and exposed to the agent when the skill loads.
 *
 * @see https://agentskills.io/specification
 */
import { parseSkill, type SkillFrontmatter } from './loader'

// Raw contents of every SKILL.md — bundled at build time
const skillModules = import.meta.glob<string>('../../../../../skills/*/SKILL.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

// Every other file under a skill directory — raw contents, bundled at
// build time. Used to serve scripts/references to the agent on request.
const skillResources = import.meta.glob<string>('../../../../../skills/*/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export interface BundledSkill {
  name: string
  description: string
  /** Absolute-ish glob path to the SKILL.md (stable key for loading) */
  path: string
  frontmatter: SkillFrontmatter
  body: string
  /** Paths of sibling files (scripts/*, references/*, etc.), RELATIVE to the skill directory. */
  resources: string[]
}

/** Derive the skill's base directory glob path from its SKILL.md path. */
function skillDirectoryOf(skillMdPath: string): string {
  return skillMdPath.replace(/\/SKILL\.md$/, '')
}

/** Enumerate sibling files for a skill (paths relative to the skill directory). */
function listResourcesFor(skillDir: string): string[] {
  const prefix = `${skillDir}/`
  return Object.keys(skillResources)
    .filter((p) => p.startsWith(prefix) && !p.endsWith('/SKILL.md'))
    .map((p) => p.slice(prefix.length))
    .sort()
}

let cached: BundledSkill[] | null = null

/** List all bundled skills with metadata (parsed). */
export async function listBundledSkills(): Promise<BundledSkill[]> {
  if (cached) return cached

  const result: BundledSkill[] = []
  for (const [path, content] of Object.entries(skillModules)) {
    if (typeof content !== 'string') continue
    const dir = skillDirectoryOf(path)
    const expectedName = dir.split('/').pop()
    try {
      const parsed = parseSkill(content, { expectedName })
      if (parsed.warnings.length > 0) {
        console.warn(`Skill ${parsed.frontmatter.name} parsed with warnings:`, parsed.warnings)
      }
      result.push({
        name: parsed.frontmatter.name,
        description: parsed.frontmatter.description,
        path,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        resources: listResourcesFor(dir),
      })
    } catch (error) {
      console.error(`Failed to parse bundled skill at ${path}:`, error)
    }
  }
  cached = result
  return result
}

/** Get the raw content of a specific bundled SKILL.md by its glob path. */
export async function getBundledSkill(path: string): Promise<string> {
  const content = skillModules[path]
  if (typeof content !== 'string') {
    throw new Error(`Bundled skill not found: ${path}`)
  }
  return content
}

/**
 * Get the raw content of a bundled resource file by skill name + relative path.
 * Used to serve scripts/references when the agent requests them via fs tools.
 * Returns null if the skill or file doesn't exist.
 */
export async function getBundledSkillResource(
  skillName: string,
  relativePath: string
): Promise<string | null> {
  const skill = (await listBundledSkills()).find((s) => s.name === skillName)
  if (!skill) return null
  const dir = skillDirectoryOf(skill.path)
  const fullPath = `${dir}/${relativePath}`
  const content = skillResources[fullPath]
  return typeof content === 'string' ? content : null
}
