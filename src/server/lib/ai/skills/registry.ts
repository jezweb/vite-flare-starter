/**
 * Skills Registry
 *
 * Indexes skills from multiple sources in D1 and resolves their content on demand.
 *
 * Sources:
 * - bundled: shipped in /skills directory at repo root, available via static imports
 * - r2: stored in the SKILLS R2 bucket (user-uploaded)
 * - github: fetched from a GitHub repo, cached in R2
 *
 * Progressive disclosure: only metadata (name + description) is loaded into the
 * system prompt by default. Full body is loaded via load_skill tool on demand.
 */
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { skills } from '@/server/modules/skills/db/schema'
import { parseSkill, type ParsedSkill } from './loader'
import { getBundledSkill, listBundledSkills } from './bundled'

interface SkillsEnv {
  DB: D1Database
  SKILLS?: R2Bucket
}

export interface SkillSummary {
  name: string
  description: string
  source: 'bundled' | 'r2' | 'github'
}

// Module-level sync flag — auto-sync bundled skills once per worker isolate
let bundledSyncedThisIsolate = false

/**
 * Get all enabled skills (metadata only) for system prompt injection.
 *
 * Auto-syncs bundled skills on first call per isolate. Idempotent.
 */
export async function listSkills(env: SkillsEnv): Promise<SkillSummary[]> {
  const db = drizzle(env.DB)

  if (!bundledSyncedThisIsolate) {
    try {
      await syncBundledSkills(env)
      bundledSyncedThisIsolate = true
    } catch (error) {
      console.error('Failed to auto-sync bundled skills:', error)
    }
  }

  const rows = await db
    .select({ name: skills.name, description: skills.description, source: skills.source })
    .from(skills)
    .where(eq(skills.enabled, true))

  return rows.map((r) => ({
    name: r.name,
    description: r.description,
    source: r.source,
  }))
}

/**
 * Load a specific skill's full content (frontmatter + body).
 * Resolves from the appropriate source.
 */
export async function loadSkill(env: SkillsEnv, name: string): Promise<ParsedSkill | null> {
  const db = drizzle(env.DB)
  const row = await db
    .select()
    .from(skills)
    .where(eq(skills.name, name))
    .get()

  if (!row || !row.enabled) return null

  let content: string
  switch (row.source) {
    case 'bundled':
      content = await getBundledSkill(row.path)
      break

    case 'r2':
      if (!env.SKILLS) throw new Error('SKILLS R2 bucket not configured')
      const obj = await env.SKILLS.get(row.path)
      if (!obj) return null
      content = await obj.text()
      break

    case 'github':
      // Fetch with simple cache via R2 if available
      if (env.SKILLS) {
        const cacheKey = `github-cache/${row.path.replace(/[^a-zA-Z0-9-]/g, '_')}`
        const cached = await env.SKILLS.get(cacheKey)
        if (cached) {
          content = await cached.text()
          break
        }
      }
      const response = await fetch(row.path)
      if (!response.ok) throw new Error(`Failed to fetch skill from ${row.path}: ${response.status}`)
      content = await response.text()
      // Cache for next time
      if (env.SKILLS) {
        const cacheKey = `github-cache/${row.path.replace(/[^a-zA-Z0-9-]/g, '_')}`
        await env.SKILLS.put(cacheKey, content)
      }
      break

    default:
      return null
  }

  return parseSkill(content)
}

/**
 * Sync bundled skills to the registry. Call on startup or via admin action.
 * Also cleans up bundled entries that no longer exist.
 */
export async function syncBundledSkills(env: SkillsEnv): Promise<{ added: number; updated: number; removed: number }> {
  const db = drizzle(env.DB)
  const bundled = await listBundledSkills()
  const existing = await db.select().from(skills).where(eq(skills.source, 'bundled'))

  const existingByName = new Map(existing.map((s) => [s.name, s]))
  const bundledNames = new Set(bundled.map((s) => s.name))

  let added = 0
  let updated = 0
  let removed = 0

  for (const b of bundled) {
    const existing = existingByName.get(b.name)
    const metadata = JSON.stringify(b.frontmatter)
    if (!existing) {
      await db.insert(skills).values({
        name: b.name,
        description: b.description,
        source: 'bundled',
        path: b.path,
        metadata,
      })
      added++
    } else if (existing.description !== b.description || existing.metadata !== metadata) {
      await db
        .update(skills)
        .set({ description: b.description, metadata, updatedAt: new Date() })
        .where(eq(skills.id, existing.id))
      updated++
    }
  }

  // Remove bundled skills no longer in the source
  for (const e of existing) {
    if (!bundledNames.has(e.name)) {
      await db.delete(skills).where(eq(skills.id, e.id))
      removed++
    }
  }

  return { added, updated, removed }
}

/**
 * Register a skill from a GitHub URL.
 *
 * @example
 *   addGitHubSkill(env, 'https://raw.githubusercontent.com/anthropics/skills/main/skill-name/SKILL.md')
 */
export async function addGitHubSkill(env: SkillsEnv, url: string): Promise<{ name: string; description: string }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  const content = await response.text()
  const parsed = parseSkill(content)

  const db = drizzle(env.DB)
  const existing = await db.select().from(skills).where(eq(skills.name, parsed.frontmatter.name)).get()

  if (existing) {
    await db
      .update(skills)
      .set({
        description: parsed.frontmatter.description,
        source: 'github',
        path: url,
        metadata: JSON.stringify(parsed.frontmatter),
        updatedAt: new Date(),
      })
      .where(eq(skills.id, existing.id))
  } else {
    await db.insert(skills).values({
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      source: 'github',
      path: url,
      metadata: JSON.stringify(parsed.frontmatter),
    })
  }

  return { name: parsed.frontmatter.name, description: parsed.frontmatter.description }
}

/**
 * Upload a skill to R2.
 */
export async function uploadSkillToR2(
  env: SkillsEnv,
  content: string,
  options?: { overwrite?: boolean }
): Promise<{ name: string; description: string; path: string }> {
  if (!env.SKILLS) throw new Error('SKILLS R2 bucket not configured')

  const parsed = parseSkill(content)
  const path = `${parsed.frontmatter.name}/SKILL.md`

  const db = drizzle(env.DB)
  const existing = await db.select().from(skills).where(eq(skills.name, parsed.frontmatter.name)).get()

  if (existing && !options?.overwrite) {
    throw new Error(`Skill "${parsed.frontmatter.name}" already exists. Set overwrite: true to replace.`)
  }

  await env.SKILLS.put(path, content, { httpMetadata: { contentType: 'text/markdown' } })

  if (existing) {
    await db
      .update(skills)
      .set({
        description: parsed.frontmatter.description,
        source: 'r2',
        path,
        metadata: JSON.stringify(parsed.frontmatter),
        updatedAt: new Date(),
      })
      .where(eq(skills.id, existing.id))
  } else {
    await db.insert(skills).values({
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      source: 'r2',
      path,
      metadata: JSON.stringify(parsed.frontmatter),
    })
  }

  return { name: parsed.frontmatter.name, description: parsed.frontmatter.description, path }
}
